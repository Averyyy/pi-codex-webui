import assert from "node:assert/strict"
import test from "node:test"

import { SessionStreamStore, type FrameScheduler } from "./session-stream-store"

class TestFrames implements FrameScheduler {
  private nextHandle = 0
  private callbacks = new Map<number, () => void>()

  request(callback: () => void) {
    const handle = ++this.nextHandle
    this.callbacks.set(handle, callback)
    return handle
  }

  cancel(handle: number) {
    this.callbacks.delete(handle)
  }

  flush() {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of callbacks) callback()
  }

  get size() {
    return this.callbacks.size
  }
}

test("coalesces assistant token updates into one browser frame", () => {
  const frames = new TestFrames()
  const store = new SessionStreamStore(frames)
  let notifications = 0
  store.subscribe(() => {
    notifications += 1
  })

  store.startMessage({ role: "assistant", content: [] })
  store.updateMessage({
    role: "assistant",
    content: [{ type: "text", text: "hel" }],
  })
  store.updateMessage({
    role: "assistant",
    content: [{ type: "text", text: "hello" }],
  })

  assert.equal(frames.size, 1)
  assert.deepEqual(store.getMessages(), [])
  frames.flush()
  assert.equal(notifications, 1)
  assert.deepEqual(store.getMessages(), [
    {
      id: 1,
      role: "assistant",
      parts: [{ type: "text", text: "hello" }],
      complete: false,
    },
  ])
})

test("keeps the complete live run until the transcript handoff", () => {
  const frames = new TestFrames()
  const store = new SessionStreamStore(frames)

  store.startMessage({ role: "user", content: "Inspect it" })
  store.endMessage({ role: "user", content: "Inspect it" })
  store.startMessage({
    role: "assistant",
    content: [{ type: "text", text: "Checking" }],
  })
  store.endMessage({
    role: "assistant",
    content: [
      { type: "text", text: "Checking" },
      { type: "toolCall", id: "tool-1", name: "read", arguments: {} },
    ],
  })
  frames.flush()

  assert.equal(store.getMessages().length, 2)
  assert.equal(store.getMessages()[0]?.role, "user")
  assert.equal(store.getMessages()[1]?.role, "assistant")

  store.endTool({
    toolCallId: "tool-1",
    toolName: "read",
    result: {
      content: [{ type: "text", text: "file contents" }],
      details: { lines: 1 },
    },
    isError: false,
  })
  frames.flush()

  assert.deepEqual(store.getTool("tool-1"), {
    id: "tool-1",
    name: "read",
    arguments: {},
    status: "complete",
    result: {
      parts: [{ type: "text", text: "file contents" }],
      details: { lines: 1 },
      isError: false,
    },
  })

  store.clear(true)
  assert.deepEqual(store.getMessages(), [])
  assert.equal(store.getTool("tool-1"), null)
})

test("tracks parallel tools independently and streams partial results", () => {
  const frames = new TestFrames()
  const store = new SessionStreamStore(frames)

  store.startTool({ toolCallId: "a", toolName: "read", args: { path: "a" } })
  store.startTool({ toolCallId: "b", toolName: "grep", args: { pattern: "b" } })
  frames.flush()
  assert.deepEqual(store.getActiveTools(), [
    { id: "a", name: "read" },
    { id: "b", name: "grep" },
  ])
  const runningTools = store.getActiveTools()

  store.updateTool({
    toolCallId: "a",
    toolName: "read",
    args: { path: "a" },
    partialResult: { content: [{ type: "text", text: "partial" }] },
  })
  frames.flush()
  assert.equal(store.getTool("a")?.result?.parts[0]?.type, "text")
  assert.strictEqual(store.getActiveTools(), runningTools)

  store.endTool({
    toolCallId: "a",
    toolName: "read",
    result: { content: [{ type: "text", text: "done" }] },
    isError: false,
  })
  frames.flush()
  assert.deepEqual(store.getActiveTools(), [{ id: "b", name: "grep" }])
  assert.equal(store.getTool("a")?.status, "complete")
  assert.equal(store.getTool("b")?.status, "running")
})

test("recovers when the first replayed event is a message update", () => {
  const frames = new TestFrames()
  const store = new SessionStreamStore(frames)

  store.updateMessage({
    role: "assistant",
    content: [{ type: "text", text: "already streaming" }],
  })
  frames.flush()

  assert.deepEqual(store.getMessages()[0]?.parts, [
    { type: "text", text: "already streaming" },
  ])
  assert.equal(store.getMessages()[0]?.complete, false)
})

test("publishes runtime status immediately and preserves it across stream clears", () => {
  const frames = new TestFrames()
  const store = new SessionStreamStore(frames)
  let notifications = 0
  store.subscribe(() => {
    notifications += 1
  })

  store.setRuntimeStatus("busy")
  assert.equal(store.getRuntimeStatus(), "busy")
  assert.equal(notifications, 1)

  store.startMessage({ role: "assistant", content: "working" })
  store.clear(true)
  assert.equal(store.getRuntimeStatus(), "busy")
  assert.deepEqual(store.getMessages(), [])

  store.setRuntimeStatus("ready")
  assert.equal(store.getRuntimeStatus(), "ready")
})
