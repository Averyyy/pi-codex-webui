import assert from "node:assert/strict"
import test from "node:test"

import { EventHub } from "./event-hub"

const decoder = new TextDecoder()

test("streams only events for the subscribed session", async () => {
  const hub = new EventHub()
  const controller = new AbortController()
  const reader = hub.stream(["session-a"], null, controller.signal).getReader()

  assert.equal(decoder.decode((await reader.read()).value), ": connected\n\n")

  hub.publish({ type: "session.updated", sessionId: "session-b", payload: {} })
  hub.publish({
    type: "session.updated",
    sessionId: "session-a",
    payload: { value: 1 },
  })

  const event = decoder.decode((await reader.read()).value)
  assert.match(event, /event: session\.updated/)
  assert.match(event, /"sessionId":"session-a"/)
  assert.doesNotMatch(event, /session-b/)

  await reader.cancel()
})

test("replays retained events after Last-Event-ID", async () => {
  const hub = new EventHub()
  hub.publish({ type: "first", sessionId: "session-a", payload: {} })
  hub.publish({ type: "second", sessionId: "session-a", payload: {} })
  const controller = new AbortController()
  const reader = hub
    .stream(["session-a"], "event-1", controller.signal)
    .getReader()

  await reader.read()
  const replay = decoder.decode((await reader.read()).value)
  assert.match(replay, /id: event-2/)
  assert.match(replay, /event: second/)

  controller.abort()
  assert.equal((await reader.read()).done, true)
})

test("requests an authoritative resync when replay history expired", async () => {
  const hub = new EventHub()
  for (let index = 0; index < 1_001; index += 1) {
    hub.publish({ type: "tick", sessionId: "session-a", payload: { index } })
  }
  const reader = hub
    .stream(["session-a"], "event-0", new AbortController().signal)
    .getReader()

  await reader.read()
  const resync = decoder.decode((await reader.read()).value)
  assert.match(resync, /id: event-1001/)
  assert.match(resync, /event: resync\.required/)
  assert.match(resync, /event-history-expired/)

  await reader.cancel()
})

test("exposes recent events and mirrors every event to the protocol inspector", async () => {
  const hub = new EventHub()
  hub.publish({ type: "runtime.ready", sessionId: "session-a", payload: {} })
  hub.publish({ type: "runtime.log", sessionId: "session-b", payload: {} })
  assert.deepEqual(
    hub.recent("session-a").map((event) => event.type),
    ["runtime.ready"]
  )

  const reader = hub
    .stream(["session-a"], null, new AbortController().signal, "protocol.event")
    .getReader()
  await reader.read()
  hub.publish({
    type: "tool.execution.start",
    sessionId: "session-a",
    payload: { toolName: "read" },
  })
  const event = decoder.decode((await reader.read()).value)
  assert.match(event, /event: protocol\.event/)
  assert.match(event, /"type":"tool\.execution\.start"/)
  await reader.cancel()
})
