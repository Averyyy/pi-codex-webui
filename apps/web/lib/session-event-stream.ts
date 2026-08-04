export type SessionEventListener = (event: Event) => void
export type SessionConnectionState = "open" | "error"

interface EventSourceLike {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  close(): void
}

type EventSourceFactory = (url: string) => EventSourceLike

const browserEventSource: EventSourceFactory = (url) => new EventSource(url)

export class SessionEventStream {
  private source: EventSourceLike | null = null
  private connectionState: SessionConnectionState | null = null
  private readonly listeners = new Map<string, Set<SessionEventListener>>()
  private readonly forwarders = new Map<string, EventListener>()
  private readonly connectionListeners = new Set<
    (state: SessionConnectionState) => void
  >()
  private readonly url: string

  constructor(
    sessionId: string,
    initialEventCursor: string,
    private readonly createEventSource: EventSourceFactory = browserEventSource
  ) {
    const search = new URLSearchParams({
      sessionId,
      after: initialEventCursor,
    })
    this.url = `/api/v1/events?${search}`
  }

  open() {
    if (this.source) return
    const source = this.createEventSource(this.url)
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
    this.source?.close()
    this.source = null
    this.connectionState = null
    this.listeners.clear()
    this.forwarders.clear()
    this.connectionListeners.clear()
  }

  private attach(type: string) {
    if (!this.source || this.forwarders.has(type)) return
    const forward: EventListener = (event) => {
      for (const listener of this.listeners.get(type) ?? []) {
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
