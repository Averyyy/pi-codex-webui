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

test("streams every session through an explicit wildcard subscription", async () => {
  const hub = new EventHub()
  const reader = hub
    .stream(null, null, new AbortController().signal)
    .getReader()

  await reader.read()
  hub.publish({ type: "session.updated", sessionId: "session-a", payload: {} })
  hub.publish({ type: "session.updated", sessionId: "session-b", payload: {} })

  assert.match(decoder.decode((await reader.read()).value), /session-a/)
  assert.match(decoder.decode((await reader.read()).value), /session-b/)
  await reader.cancel()
})

test("replays retained events after Last-Event-ID", async () => {
  const hub = new EventHub()
  const first = hub.publish({
    type: "first",
    sessionId: "session-a",
    payload: {},
  })
  const second = hub.publish({
    type: "second",
    sessionId: "session-a",
    payload: {},
  })
  const controller = new AbortController()
  const reader = hub
    .stream(["session-a"], first.id, controller.signal)
    .getReader()

  await reader.read()
  const replay = decoder.decode((await reader.read()).value)
  assert.match(replay, new RegExp(`id: ${second.id}`))
  assert.match(replay, /event: second/)

  controller.abort()
  assert.equal((await reader.read()).done, true)
})

test("replays events published after a server-render cursor", async () => {
  const hub = new EventHub()
  const cursor = hub.cursor()
  const event = hub.publish({
    type: "session.completed",
    sessionId: "session-a",
    payload: {},
  })
  const reader = hub
    .stream(["session-a"], cursor, new AbortController().signal)
    .getReader()

  await reader.read()
  const replay = decoder.decode((await reader.read()).value)
  assert.match(replay, new RegExp(`id: ${event.id}`))
  assert.match(replay, /event: session\.completed/)
  await reader.cancel()
})

test("requests an authoritative resync when replay history expired", async () => {
  const hub = new EventHub()
  for (let index = 0; index < 1_001; index += 1) {
    hub.publish({ type: "tick", sessionId: "session-a", payload: { index } })
  }
  const cursor = hub.cursor().replace(/-\d+$/, "-0")
  const reader = hub
    .stream(["session-a"], cursor, new AbortController().signal)
    .getReader()

  await reader.read()
  const resync = decoder.decode((await reader.read()).value)
  assert.match(resync, new RegExp(`id: ${hub.cursor()}`))
  assert.match(resync, /event: resync\.required/)
  assert.match(resync, /event-history-expired/)

  await reader.cancel()
})

test("requests resync for cursors from every other event epoch", async () => {
  const previous = new EventHub()
  for (let index = 0; index < 3; index += 1) {
    previous.publish({ type: "old", sessionId: "session-a", payload: {} })
  }
  const previousCursor = previous.cursor()

  for (const currentEventCount of [0, 3, 4]) {
    const hub = new EventHub()
    for (let index = 0; index < currentEventCount; index += 1) {
      hub.publish({ type: "current", sessionId: "session-a", payload: {} })
    }
    const reader = hub
      .stream(["session-a"], previousCursor, new AbortController().signal)
      .getReader()

    await reader.read()
    const resync = decoder.decode((await reader.read()).value)
    assert.match(resync, new RegExp(`id: ${hub.cursor()}`))
    assert.match(resync, /event: resync\.required/)
    assert.match(resync, /event-epoch-changed/)
    await reader.cancel()
  }
})

test("requests resync for legacy, malformed, and future cursors", async () => {
  const hub = new EventHub()
  const cursors = ["event-42", "not-a-cursor", `${hub.cursor()}-bad`]
  for (const cursor of cursors) {
    const reader = hub
      .stream(["session-a"], cursor, new AbortController().signal)
      .getReader()

    await reader.read()
    const resync = decoder.decode((await reader.read()).value)
    assert.match(resync, new RegExp(`id: ${hub.cursor()}`))
    assert.match(resync, /event: resync\.required/)
    assert.match(resync, /event-cursor-invalid/)
    await reader.cancel()
  }

  hub.publish({ type: "now", sessionId: "session-a", payload: {} })
  const future = hub.cursor().replace(/-\d+$/, "-2")
  const reader = hub
    .stream(["session-a"], future, new AbortController().signal)
    .getReader()

  await reader.read()
  const resync = decoder.decode((await reader.read()).value)
  assert.match(resync, /event: resync\.required/)
  assert.match(resync, /event-cursor-ahead/)
  await reader.cancel()
})

test("requests resync for an old epoch even when the current history is empty", async () => {
  const previous = new EventHub()
  previous.publish({ type: "old", sessionId: "session-a", payload: {} })
  const hub = new EventHub()
  const reader = hub
    .stream(["session-a"], previous.cursor(), new AbortController().signal)
    .getReader()

  await reader.read()
  const resync = decoder.decode((await reader.read()).value)
  assert.match(resync, /event: resync\.required/)
  assert.match(resync, /event-epoch-changed/)
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
