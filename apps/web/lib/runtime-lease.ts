export interface RuntimeLeaseTransport<T> {
  acquire(sessionId: string, leaseId: string): Promise<T>
  renew(sessionId: string, leaseId: string): Promise<T>
  release(sessionId: string, leaseId: string): Promise<void>
}

export function createRuntimeLeaseId() {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function")
    throw new Error("This browser cannot create a runtime lease identifier.")
  return crypto.randomUUID()
}

export type RuntimeLeaseOperation = "acquire" | "renew"

export interface RuntimeLeaseCallbacks<T> {
  onReady(value: T, operation: RuntimeLeaseOperation): void
  onError(error: unknown, operation: RuntimeLeaseOperation): void
  onReleaseError?(error: unknown): void
}

export type RuntimeLeaseTimerHandle = ReturnType<typeof setTimeout>

export interface RuntimeLeaseControllerOptions {
  renewAfterMs?: number
  setTimer?: (callback: () => void, delayMs: number) => RuntimeLeaseTimerHandle
  clearTimer?: (handle: RuntimeLeaseTimerHandle) => void
}

interface LeaseEntry {
  sessionId: string
  leaseId: string
  active: boolean
  serverLeasePresent: boolean
  retained: boolean
  acquireInFlight: boolean
  renewInFlight: boolean
  releaseRequested: boolean
  releaseInFlight: Promise<void> | null
  renewalEnabled: boolean
  timer: RuntimeLeaseTimerHandle | null
}

const DEFAULT_RENEW_AFTER_MS = 60_000

/**
 * Owns one composer lease at a time. The controller deliberately separates
 * acquiring from renewing: a missing/expired lease must be reacquired by an
 * explicit reconnect trigger instead of turning every heartbeat into a fresh
 * runtime activation.
 */
export class RuntimeLeaseController<T> {
  private current: LeaseEntry | null = null
  private readonly renewAfterMs: number
  private readonly setTimer: (
    callback: () => void,
    delayMs: number
  ) => RuntimeLeaseTimerHandle
  private readonly clearTimer: (handle: RuntimeLeaseTimerHandle) => void

  constructor(
    private readonly transport: RuntimeLeaseTransport<T>,
    private readonly callbacks: RuntimeLeaseCallbacks<T>,
    options: RuntimeLeaseControllerOptions = {}
  ) {
    this.renewAfterMs = options.renewAfterMs ?? DEFAULT_RENEW_AFTER_MS
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))
  }

  start(sessionId: string, leaseId: string) {
    this.releaseCurrent()
    const entry: LeaseEntry = {
      sessionId,
      leaseId,
      active: true,
      serverLeasePresent: false,
      retained: false,
      acquireInFlight: false,
      renewInFlight: false,
      releaseRequested: false,
      releaseInFlight: null,
      renewalEnabled: true,
      timer: null,
    }
    this.current = entry
    void this.acquire(entry)
  }

  /** Reconnect through POST after an explicit browser/SSE/user trigger. */
  reconnect() {
    const entry = this.current
    if (!entry || !entry.active || !entry.renewalEnabled) return
    if (entry.acquireInFlight || entry.renewInFlight) return
    this.clearScheduled(entry)
    // Heartbeats use PUT. Explicit reconnects use POST so a lease that expired
    // while the tab was suspended is restored in one operation.
    entry.retained = false
    void this.acquire(entry)
  }

  /** Pause renewal while the runtime is explicitly stopped or crashed. */
  pause() {
    const entry = this.current
    if (!entry) return
    entry.renewalEnabled = false
    entry.retained = false
    this.clearScheduled(entry)
  }

  /** Resume an existing lease, or explicitly reacquire an expired one. */
  resume() {
    const entry = this.current
    if (!entry || !entry.active) return
    entry.renewalEnabled = true
    this.clearScheduled(entry)
    if (entry.retained) {
      this.schedule(entry, 0)
    } else {
      this.reconnect()
    }
  }

  /** User initiated retry; this is also safe after a failed acquire. */
  retry() {
    const entry = this.current
    if (!entry || !entry.active) return
    entry.renewalEnabled = true
    this.clearScheduled(entry)
    if (!entry.acquireInFlight && !entry.renewInFlight) {
      if (entry.retained) this.schedule(entry, 0)
      else this.reconnect()
    }
  }

  /**
   * Invalidate the current lease. If acquire is still waiting for activation,
   * release is deferred until the acquire response arrives so the server can
   * never retain an orphaned owner.
   */
  release() {
    this.releaseCurrent()
  }

  private releaseCurrent() {
    const entry = this.current
    if (!entry) return
    entry.active = false
    entry.renewalEnabled = false
    this.clearScheduled(entry)
    this.current = null
    if (entry.acquireInFlight) {
      entry.releaseRequested = true
      return
    }
    if (entry.serverLeasePresent) {
      void this.releaseEntry(entry)
    }
  }

  private async acquire(entry: LeaseEntry) {
    if (!entry.active || entry.acquireInFlight) return
    entry.acquireInFlight = true
    try {
      const value = await this.transport.acquire(entry.sessionId, entry.leaseId)
      entry.acquireInFlight = false
      entry.serverLeasePresent = true
      entry.retained = true
      if (!entry.active) {
        await this.releaseEntry(entry)
        return
      }
      this.callbacks.onReady(value, "acquire")
      if (entry.renewalEnabled) this.schedule(entry, this.renewAfterMs)
    } catch (error) {
      entry.acquireInFlight = false
      if (!entry.active) return
      this.callbacks.onError(error, "acquire")
      // Keep the failure visible. A later visibility/online/SSE event or the
      // retry button invokes reconnect() and starts a new acquire explicitly.
    }
  }

  private schedule(entry: LeaseEntry, delayMs: number) {
    this.clearScheduled(entry)
    entry.timer = this.setTimer(() => {
      entry.timer = null
      void this.renew(entry)
    }, delayMs)
  }

  private clearScheduled(entry: LeaseEntry) {
    if (entry.timer === null) return
    this.clearTimer(entry.timer)
    entry.timer = null
  }

  private async renew(entry: LeaseEntry) {
    if (
      !entry.active ||
      !entry.retained ||
      !entry.renewalEnabled ||
      entry.renewInFlight
    )
      return
    entry.renewInFlight = true
    try {
      const value = await this.transport.renew(entry.sessionId, entry.leaseId)
      entry.renewInFlight = false
      if (!entry.active) return
      this.callbacks.onReady(value, "renew")
      if (entry.renewalEnabled) this.schedule(entry, this.renewAfterMs)
    } catch (error) {
      entry.renewInFlight = false
      if (!entry.active) return
      entry.retained = false
      this.callbacks.onError(error, "renew")
      // Do not reacquire in a heartbeat loop. A later visibility/online/SSE
      // event or the retry button invokes reconnect() explicitly.
    }
  }

  private releaseEntry(entry: LeaseEntry) {
    if (entry.releaseInFlight) return entry.releaseInFlight
    entry.releaseInFlight = this.transport
      .release(entry.sessionId, entry.leaseId)
      .catch((error: unknown) => {
        this.callbacks.onReleaseError?.(error)
      })
    return entry.releaseInFlight
  }
}
