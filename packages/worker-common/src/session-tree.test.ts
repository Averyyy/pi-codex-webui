import assert from "node:assert/strict"
import test from "node:test"

import { sessionTreeEntryText } from "./session-tree.js"

type SessionEntry = Parameters<typeof sessionTreeEntryText>[0]

function message(content: unknown) {
  return {
    type: "message",
    id: "entry",
    parentId: null,
    timestamp: "2026-07-15T08:00:00.000Z",
    message: { role: "assistant", content },
  } as SessionEntry
}

test("extracts only real text blocks from session messages", () => {
  assert.equal(
    sessionTreeEntryText(
      message([
        { type: "thinking", thinking: "private" },
        { type: "text", text: "visible " },
        { type: "toolCall", id: "call", name: "read", arguments: {} },
        { type: "text", text: "answer" },
      ])
    ),
    "visible answer"
  )
})

test("caps tree display text to the same 200 characters as Pi", () => {
  assert.equal(sessionTreeEntryText(message("x".repeat(250)))?.length, 200)
})

test("uses persisted summaries and titles without generating replacements", () => {
  assert.equal(
    sessionTreeEntryText({
      type: "branch_summary",
      id: "summary",
      parentId: null,
      timestamp: "2026-07-15T08:00:00.000Z",
      fromId: "entry",
      summary: "真实的分支摘要",
    }),
    "真实的分支摘要"
  )
  assert.equal(
    sessionTreeEntryText({
      type: "session_info",
      id: "title",
      parentId: null,
      timestamp: "2026-07-15T08:00:00.000Z",
      name: "真实标题",
    }),
    "真实标题"
  )
})
