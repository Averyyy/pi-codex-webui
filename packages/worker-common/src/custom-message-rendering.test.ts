import assert from "node:assert/strict"
import test from "node:test"

import type { SessionEntry } from "@earendil-works/pi-coding-agent"

import { RpcCustomMessageRenderer } from "./custom-message-rendering.js"

function rendererCalls() {
  const calls: Array<{
    customType: string
    message: unknown
    replacesEntry: {
      entryId: string
      customType: string
      messageTimestamp: number
    }
  }> = []
  return {
    calls,
    host: {
      tryRenderMessage(
        customType: string,
        message: unknown,
        replacesEntry: (typeof calls)[number]["replacesEntry"]
      ) {
        calls.push({ customType, message, replacesEntry })
      },
    },
  }
}

function entries() {
  return [
    {
      type: "custom_message",
      id: "visible",
      parentId: null,
      timestamp: "2026-07-30T12:00:00.000Z",
      customType: "skill-loaded",
      content: "Loaded",
      display: true,
      details: { skillName: "review" },
    },
    {
      type: "custom_message",
      id: "hidden",
      parentId: "visible",
      timestamp: "2026-07-30T12:00:01.000Z",
      customType: "internal",
      content: "Hidden",
      display: false,
    },
  ] as SessionEntry[]
}

test("restores visible custom messages with their exact session entry", () => {
  const { calls, host } = rendererCalls()
  const renderer = new RpcCustomMessageRenderer(host)

  renderer.restore(entries())
  renderer.restore(entries())

  assert.deepEqual(calls, [
    {
      customType: "skill-loaded",
      message: {
        role: "custom",
        customType: "skill-loaded",
        content: "Loaded",
        display: true,
        details: { skillName: "review" },
        timestamp: Date.parse("2026-07-30T12:00:00.000Z"),
      },
      replacesEntry: {
        entryId: "visible",
        customType: "skill-loaded",
        messageTimestamp: Date.parse("2026-07-30T12:00:00.000Z"),
      },
    },
  ])
})

test("renders a completed live message after its branch entry is persisted", () => {
  const { calls, host } = rendererCalls()
  const renderer = new RpcCustomMessageRenderer(host)
  const message = {
    role: "custom",
    customType: "prompt-template-subagent",
    content: "Done",
    display: true,
    details: { agent: "worker" },
    timestamp: 42,
  }
  const branch = [
    ...entries(),
    {
      type: "custom_message",
      id: "completed",
      parentId: "hidden",
      timestamp: "2026-07-30T12:00:02.000Z",
      customType: "prompt-template-subagent",
      content: "Done",
      display: true,
      details: { agent: "worker" },
    },
  ] as SessionEntry[]

  renderer.restore(entries())
  renderer.renderCompleted(message, entries())
  renderer.renderCompleted(message, branch)
  renderer.renderCompleted(message, branch)

  assert.deepEqual(calls.at(-1), {
    customType: "prompt-template-subagent",
    message,
    replacesEntry: {
      entryId: "completed",
      customType: "prompt-template-subagent",
      messageTimestamp: 42,
    },
  })
  assert.equal(calls.length, 2)
})
