import assert from "node:assert/strict"
import test from "node:test"

import { applySessionLiveEvent } from "./session-live-events"
import { SessionStreamStore, type FrameScheduler } from "./session-stream-store"

class TestFrames implements FrameScheduler {
  private callback: (() => void) | undefined

  request(callback: () => void) {
    this.callback = callback
    return 1
  }

  cancel() {
    this.callback = undefined
  }

  flush() {
    const callback = this.callback
    this.callback = undefined
    callback?.()
  }
}

test("native nested tool events stay in the parent codemode tool card", () => {
  const frames = new TestFrames()
  const store = new SessionStreamStore(frames)
  const apply = (type: string, payload: unknown) =>
    applySessionLiveEvent(store, { type, payload })

  apply("tool.execution.start", {
    toolCallId: "codemode-1",
    toolName: "codemode",
    args: { code: "await tools.read({ path: 'README.md' })" },
  })
  apply("tool.execution.update", {
    toolCallId: "codemode-1",
    toolName: "codemode",
    args: { code: "await tools.read({ path: 'README.md' })" },
    partialResult: {
      content: [],
      details: {
        calls: [
          {
            id: "codemode-1/1",
            name: "read",
            args: '{"path":"README.md"}',
            status: "running",
          },
        ],
      },
    },
  })
  apply("tool.execution.start", {
    toolCallId: "codemode-1/1",
    toolName: "read",
    parentToolCallId: "codemode-1",
    args: { path: "README.md" },
  })
  apply("tool.execution.end", {
    toolCallId: "codemode-1/1",
    toolName: "read",
    parentToolCallId: "codemode-1",
    result: { content: [{ type: "text", text: "README" }] },
    isError: false,
  })
  apply("tool.execution.update", {
    toolCallId: "codemode-1",
    toolName: "codemode",
    args: { code: "await tools.read({ path: 'README.md' })" },
    partialResult: {
      content: [],
      details: {
        calls: [
          {
            id: "codemode-1/1",
            name: "read",
            args: '{"path":"README.md"}',
            status: "ok",
            durationMs: 19,
          },
        ],
      },
    },
  })
  frames.flush()

  assert.equal(store.getMessages().length, 1)
  assert.equal(store.getMessages()[0]?.parts[0]?.type, "toolCall")
  assert.equal(store.getTool("codemode-1/1"), null)
  assert.deepEqual(store.getTool("codemode-1")?.result?.details, {
    calls: [
      {
        id: "codemode-1/1",
        name: "read",
        args: '{"path":"README.md"}',
        status: "ok",
        durationMs: 19,
      },
    ],
  })
})
