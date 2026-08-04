import assert from "node:assert/strict"
import test from "node:test"

import { SessionEventStream } from "./session-event-stream"

class FakeEventSource {
  readonly listeners = new Map<string, Set<EventListener>>()
  closed = false

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  close() {
    this.closed = true
  }

  emit(type: string, event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

test("shares one EventSource across session event subscribers", () => {
  const sources: { url: string; source: FakeEventSource }[] = []
  const stream = new SessionEventStream("session-a", "event-42", (url) => {
    const source = new FakeEventSource()
    sources.push({ url, source })
    return source
  })
  const runtimeEvents: string[] = []
  const extensionEvents: string[] = []
  const connectionStates: string[] = []

  stream.subscribe(["runtime.ready", "runtime.stopped"], (event) => {
    runtimeEvents.push(event.type)
  })
  stream.subscribe(["runtime.ready", "webui.view"], (event) => {
    extensionEvents.push(event.type)
  })
  stream.subscribeConnection((state) => connectionStates.push(state))
  assert.equal(sources.length, 0)

  stream.open()
  stream.open()
  assert.equal(sources.length, 1)
  assert.equal(
    sources[0]?.url,
    "/api/v1/events?sessionId=session-a&after=event-42"
  )

  const source = sources[0]!.source
  source.emit("open")
  source.emit("runtime.ready")
  source.emit("webui.view")
  assert.deepEqual(connectionStates, ["open"])
  assert.deepEqual(runtimeEvents, ["runtime.ready"])
  assert.deepEqual(extensionEvents, ["runtime.ready", "webui.view"])

  stream.close()
  assert.equal(source.closed, true)
})
