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

test("buffers named events while the session view is unmounted", () => {
  let source: FakeEventSource | undefined
  const stream = new SessionEventStream(
    "session-a",
    "event-1",
    () => {
      source = new FakeEventSource()
      return source
    },
    true
  )
  const unsubscribe = stream.subscribe(["runtime.busy"], () => {})
  stream.open()
  unsubscribe()
  source!.emit("runtime.busy")

  const received: string[] = []
  stream.subscribe(["runtime.busy"], (event) => received.push(event.type))
  source!.emit("runtime.busy")

  assert.deepEqual(received, ["runtime.busy", "runtime.busy"])
})

test("checkpoint readiness follows replay and advances the reconnect cursor", async () => {
  const cursor = "event-11111111-1111-4111-8111-111111111111-9"
  const sources: FakeEventSource[] = []
  const stream = new SessionEventStream("session-a", null, () => {
    const source = new FakeEventSource()
    sources.push(source)
    return source
  })
  let replayed = 0
  stream.subscribe(["webui.view"], () => replayed++)
  const ready = stream.waitForCheckpoint()
  stream.open()
  const source = sources[0]!
  source.emit(
    "webui.view",
    new MessageEvent("webui.view", {
      lastEventId: "event-11111111-1111-4111-8111-111111111111-8",
      data: JSON.stringify({
        id: "event-11111111-1111-4111-8111-111111111111-8",
        type: "webui.view",
        payload: {},
      }),
    })
  )
  source.emit(
    "stream.checkpoint",
    new MessageEvent("stream.checkpoint", {
      lastEventId: cursor,
      data: JSON.stringify({
        id: cursor,
        type: "stream.checkpoint",
        payload: { cursor },
      }),
    })
  )

  assert.equal(await ready, cursor)
  assert.equal(replayed, 1)
  stream.pause()
  const reconnectedReady = stream.waitForCheckpoint()
  stream.open()
  sources[1]!.emit(
    "stream.checkpoint",
    new MessageEvent("stream.checkpoint", {
      lastEventId: cursor,
      data: JSON.stringify({
        id: cursor,
        type: "stream.checkpoint",
        payload: { cursor },
      }),
    })
  )
  assert.equal(await reconnectedReady, cursor)
  stream.close()
})
