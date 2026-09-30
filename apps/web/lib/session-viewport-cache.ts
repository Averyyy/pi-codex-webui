import type { SessionRouteClientData } from "@/lib/session-route-client"
import { SessionViewController } from "@/lib/session-view-controller"

export const MAX_RETAINED_SESSION_VIEWPORTS = 8

export interface StoredSessionRoute {
  route: SessionRouteClientData
  lastUsed: number
}

export interface StoredSessionViewport extends StoredSessionRoute {
  controller: SessionViewController
}

export interface UnavailableSessionViewport {
  sessionId: string
  projectId: string | null
  identityKey: string
  message: string
}

export function retainSessionViewportRoute<T extends StoredSessionRoute>(
  current: ReadonlyMap<string, T>,
  entry: T
) {
  const next = new Map(current)
  next.set(entry.route.session.id, entry)
  if (next.size > MAX_RETAINED_SESSION_VIEWPORTS) {
    const leastRecentlyUsed = [...next.entries()]
      .filter(([sessionId]) => sessionId !== entry.route.session.id)
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed)[0]
    if (!leastRecentlyUsed) {
      throw new Error("A retained session viewport has no eviction candidate.")
    }
    next.delete(leastRecentlyUsed[0])
  }
  return next
}

const EMPTY_VIEWPORTS = new Map<string, StoredSessionViewport>()

/** The one bounded owner for routes and their session controllers across layouts. */
export class SessionViewportCache {
  private entries = new Map<string, StoredSessionViewport>()
  private readonly listeners = new Set<() => void>()
  private readonly owners = new Map<SessionViewController, number>()
  private readonly retired = new Set<SessionViewController>()
  private readonly unavailable = new Map<string, UnavailableSessionViewport>()
  private disposed = false

  constructor(
    private readonly createController: (
      sessionId: string,
      onViewUnavailable: (message: string) => void
    ) => SessionViewController = (sessionId, onViewUnavailable) =>
      new SessionViewController(
        sessionId,
        null,
        undefined,
        undefined,
        undefined,
        { onViewUnavailable }
      )
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.entries
  getServerSnapshot = () => EMPTY_VIEWPORTS

  getUnavailable(sessionId: string, projectId: string | null) {
    const unavailable = this.unavailable.get(sessionId)
    return unavailable?.projectId === projectId ? unavailable : null
  }

  private publish(next: Map<string, StoredSessionViewport>) {
    this.entries = next
    for (const listener of this.listeners) listener()
  }

  private retire(controller: SessionViewController) {
    if ((this.owners.get(controller) ?? 0) === 0) controller.dispose()
    else this.retired.add(controller)
  }

  private markUnavailable(
    sessionId: string,
    projectId: string | null,
    identityKey: string,
    message: string
  ) {
    const stored = this.entries.get(sessionId)
    if (
      !stored ||
      stored.route.projectId !== projectId ||
      stored.route.identityKey !== identityKey
    ) {
      return
    }
    const next = new Map(this.entries)
    next.delete(sessionId)
    this.unavailable.set(sessionId, {
      sessionId,
      projectId,
      identityKey,
      message,
    })
    while (this.unavailable.size > MAX_RETAINED_SESSION_VIEWPORTS) {
      const oldest = this.unavailable.keys().next().value
      if (oldest === undefined) break
      this.unavailable.delete(oldest)
    }
    this.retire(stored.controller)
    this.publish(next)
  }

  register(route: SessionRouteClientData, now = Date.now()) {
    if (this.disposed) throw new Error("Session viewport cache is disposed.")
    const unavailable = this.unavailable.get(route.session.id)
    if (unavailable?.identityKey === route.identityKey) return false
    const current = this.entries
    const previous = current.get(route.session.id)
    const controller =
      previous?.route.identityKey === route.identityKey
        ? previous.controller
        : this.createController(route.session.id, (message) =>
            this.markUnavailable(
              route.session.id,
              route.projectId,
              route.identityKey,
              message
            )
          )
    const next = retainSessionViewportRoute(current, {
      route,
      controller,
      lastUsed: now,
    })
    for (const entry of current.values()) {
      if (
        ![...next.values()].some(
          (retained) => retained.controller === entry.controller
        )
      ) {
        this.retire(entry.controller)
      }
    }
    if (unavailable) this.unavailable.delete(route.session.id)
    this.publish(next)
    return true
  }

  touch(sessionId: string, projectId: string | null, now = Date.now()) {
    const stored = this.entries.get(sessionId)
    if (!stored || stored.route.projectId !== projectId) return
    const next = new Map(this.entries)
    next.set(sessionId, { ...stored, lastUsed: now })
    this.publish(next)
  }

  reject(sessionId: string, projectId: string | null) {
    const stored = this.entries.get(sessionId)
    if (!stored || stored.route.projectId !== projectId) return
    const next = new Map(this.entries)
    next.delete(sessionId)
    this.retire(stored.controller)
    this.publish(next)
  }

  retainOwner(controller: SessionViewController) {
    if (this.disposed) throw new Error("Session viewport cache is disposed.")
    this.owners.set(controller, (this.owners.get(controller) ?? 0) + 1)
    return () => {
      const remaining = (this.owners.get(controller) ?? 0) - 1
      if (remaining > 0) this.owners.set(controller, remaining)
      else {
        this.owners.delete(controller)
        if (this.retired.delete(controller)) controller.dispose()
      }
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const entry of this.entries.values()) entry.controller.dispose()
    for (const controller of this.retired) controller.dispose()
    this.entries.clear()
    this.retired.clear()
    this.unavailable.clear()
    this.owners.clear()
    this.listeners.clear()
  }
}
