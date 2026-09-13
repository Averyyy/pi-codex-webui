export type SessionEventListener = (event: Event) => void
import { compareEventCursors } from "./session-live-events"
export type SessionConnectionState = "open" | "error"

interface EventSourceLike {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  close(): void
}

type EventSourceFactory = (url: string) => EventSourceLike

const browserEventSource: EventSourceFactory = (url) => new EventSource(url)
const MAX_PENDING_EVENTS = 4096

export class SessionEventStream {
  private source: EventSourceLike | null = null
  private connectionState: SessionConnectionState | null = null
  private readonly listeners = new Map<string, Set<SessionEventListener>>()
  private readonly forwarders = new Map<string, EventListener>()
  private readonly connectionListeners = new Set<
    (state: SessionConnectionState) => void
  >()
  private readonly pendingEvents: Event[] = []
  private cursor: string
  private minimumCursor: string

  constructor(
    private readonly sessionId: string,
    initialEventCursor: string,
    private readonly createEventSource: EventSourceFactory = browserEventSource,
    private readonly bufferUnsubscribed = false
  ) {
    this.cursor = initialEventCursor
    this.minimumCursor = initialEventCursor
  }

  open() {
    if (this.source) return
    const search = new URLSearchParams({
      sessionId: this.sessionId,
      after: this.cursor,
    })
    const source = this.createEventSource(`/api/v1/events?${search}`)
    this.source = source
    source.addEventListener("open", this.handleOpen)
    source.addEventListener("error", this.handleError)
    for (const type of this.listeners.keys()) this.attach(type)
  }

  subscribe(types: readonly string[], listener: SessionEventListener) {
    const subscribedTypes = [...new Set(types)]
    for (const type of subscribedTypes) {
      const listeners = this.listeners.get(type) ?? new Set()
      const first = listeners.size === 0
      listeners.add(listener)
      this.listeners.set(type, listeners)
      if (first && this.source) this.attach(type)
    }
    if (this.pendingEvents.length > 0) {
      const subscribed = new Set(subscribedTypes)
      const replay = this.pendingEvents.filter((event) =>
        subscribed.has(event.type)
      )
      for (const event of replay) {
        const index = this.pendingEvents.indexOf(event)
        if (index >= 0) this.pendingEvents.splice(index, 1)
        try {
          listener(event)
        } catch (error) {
          console.error("Could not replay a session event:", error)
        }
      }
    }
    return () => {
      for (const type of subscribedTypes) {
        const listeners = this.listeners.get(type)
        if (!listeners) continue
        listeners.delete(listener)
        if (listeners.size === 0) this.detach(type)
      }
    }
  }

  subscribeConnection(listener: (state: SessionConnectionState) => void) {
    this.connectionListeners.add(listener)
    if (this.connectionState) listener(this.connectionState)
    return () => this.connectionListeners.delete(listener)
  }

  close() {
    this.pause()
    this.listeners.clear()
    this.forwarders.clear()
    this.pendingEvents.length = 0
    this.connectionListeners.clear()
  }

  pause() {
    this.source?.close()
    this.source = null
    this.connectionState = null
    this.forwarders.clear()
  }

  setCursor(cursor: string) {
    const order = compareEventCursors(cursor, this.cursor)
    if (order === null || order >= 0) this.cursor = cursor
    const minimumOrder = compareEventCursors(cursor, this.minimumCursor)
    if (minimumOrder === null || minimumOrder >= 0) this.minimumCursor = cursor
  }

  clearPending() {
    this.pendingEvents.length = 0
  }

  private attach(type: string) {
    if (!this.source || this.forwarders.has(type)) return
    const forward: EventListener = (event) => {
      const eventId = (event as MessageEvent<string>).lastEventId
      if (eventId) {
        const order = compareEventCursors(eventId, this.minimumCursor)
        if (order !== null && order <= 0) return
        this.cursor = eventId
      }
      const listeners = this.listeners.get(type)
      if (!listeners || listeners.size === 0) {
        if (!this.bufferUnsubscribed) return
        this.pendingEvents.push(event)
        if (this.pendingEvents.length > MAX_PENDING_EVENTS) {
          this.pendingEvents.length = 0
          const resync = new MessageEvent("resync.required", {
            data: JSON.stringify({
              id: this.cursor,
              type: "resync.required",
              sessionId: this.sessionId,
              payload: { reason: "client-buffer-overflow" },
            }),
          })
          for (const listener of this.listeners.get("resync.required") ?? [])
            listener(resync)
        }
        return
      }
      for (const listener of listeners) {
        try {
          listener(event)
        } catch (error) {
          console.error(`Could not handle session event ${type}:`, error)
        }
      }
    }
    this.forwarders.set(type, forward)
    this.source.addEventListener(type, forward)
  }

  private detach(type: string) {
    this.listeners.delete(type)
    if (this.bufferUnsubscribed) return
    const forward = this.forwarders.get(type)
    if (forward && this.source) this.source.removeEventListener(type, forward)
    this.forwarders.delete(type)
  }

  private handleOpen = () => this.publishConnection("open")
  private handleError = () => this.publishConnection("error")

  private publishConnection(state: SessionConnectionState) {
    this.connectionState = state
    for (const listener of this.connectionListeners) listener(state)
  }
}
