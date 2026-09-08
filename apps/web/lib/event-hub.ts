import "server-only"

import { randomUUID } from "node:crypto"

export interface WebEvent {
  id: string
  seq: number
  type: string
  sessionId?: string
  operationId?: string
  timestamp: string
  payload: unknown
}

type EventInput = Omit<WebEvent, "id" | "seq" | "timestamp">
type Subscriber = {
  sessionIds: Set<string> | null
  send: (event: WebEvent) => void
}

const MAX_EVENTS = 1_000
const encoder = new TextEncoder()
const EVENT_CURSOR_PATTERN =
  /^event-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d+)$/i

declare global {
  var piWebCodexEventHub: EventHub | undefined
}

function matches(subscriber: Subscriber, event: WebEvent) {
  return (
    !event.sessionId ||
    subscriber.sessionIds === null ||
    subscriber.sessionIds.has(event.sessionId)
  )
}

function serialize(event: WebEvent, eventName = event.type) {
  return encoder.encode(
    `id: ${event.id}\nevent: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`
  )
}

function parseCursor(cursor: string) {
  const match = cursor.match(EVENT_CURSOR_PATTERN)
  if (!match) return null
  const sequence = Number(match[2])
  if (!Number.isSafeInteger(sequence)) return null
  return { epoch: match[1]!, sequence }
}

export class EventHub {
  private readonly epoch = randomUUID()
  private sequence = 0
  private readonly events: WebEvent[] = []
  private readonly subscribers = new Set<Subscriber>()

  cursor() {
    return this.eventId(this.sequence)
  }

  private eventId(sequence: number) {
    return `event-${this.epoch}-${sequence}`
  }

  private resyncEvent(reason: string): WebEvent {
    return {
      id: this.cursor(),
      seq: this.sequence,
      type: "resync.required",
      timestamp: new Date().toISOString(),
      payload: { reason },
    }
  }

  publish(input: EventInput) {
    this.sequence += 1
    const event: WebEvent = {
      ...input,
      id: this.eventId(this.sequence),
      seq: this.sequence,
      timestamp: new Date().toISOString(),
    }
    this.events.push(event)
    if (this.events.length > MAX_EVENTS) this.events.shift()
    for (const subscriber of this.subscribers) {
      if (matches(subscriber, event)) subscriber.send(event)
    }
    return event
  }

  recent(sessionId: string, limit = 100) {
    const count = Math.min(Math.max(limit, 1), MAX_EVENTS)
    return this.events
      .filter((event) => !event.sessionId || event.sessionId === sessionId)
      .slice(-count)
  }

  stream(
    sessionIds: string[] | null,
    lastEventId: string | null,
    signal: AbortSignal,
    eventName?: string
  ) {
    const subscriptions = sessionIds === null ? null : new Set(sessionIds)
    let subscriber: Subscriber | undefined
    let heartbeat: NodeJS.Timeout | undefined
    let removeAbortListener: (() => void) | undefined

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat)
      if (subscriber) this.subscribers.delete(subscriber)
      removeAbortListener?.()
      heartbeat = undefined
      subscriber = undefined
      removeAbortListener = undefined
    }

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        if (signal.aborted) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(": connected\n\n"))
        subscriber = {
          sessionIds: subscriptions,
          send: (event) => controller.enqueue(serialize(event, eventName)),
        }

        if (lastEventId !== null) {
          const parsed = parseCursor(lastEventId)
          if (!parsed) {
            subscriber.send(this.resyncEvent("event-cursor-invalid"))
          } else if (parsed.epoch !== this.epoch) {
            subscriber.send(this.resyncEvent("event-epoch-changed"))
          } else if (parsed.sequence > this.sequence) {
            subscriber.send(this.resyncEvent("event-cursor-ahead"))
          } else {
            const oldest = this.events[0]?.seq
            if (oldest !== undefined && parsed.sequence < oldest - 1) {
              subscriber.send(this.resyncEvent("event-history-expired"))
            } else {
              for (const event of this.events) {
                if (event.seq > parsed.sequence && matches(subscriber, event)) {
                  subscriber.send(event)
                }
              }
            }
          }
        }

        this.subscribers.add(subscriber)
        heartbeat = setInterval(
          () => controller.enqueue(encoder.encode(": heartbeat\n\n")),
          15_000
        )
        const close = () => {
          cleanup()
          controller.close()
        }
        signal.addEventListener("abort", close, { once: true })
        removeAbortListener = () => signal.removeEventListener("abort", close)
      },
      cancel: cleanup,
    })
  }
}

export function getEventHub() {
  globalThis.piWebCodexEventHub ??= new EventHub()
  return globalThis.piWebCodexEventHub
}
