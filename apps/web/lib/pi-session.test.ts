import assert from "node:assert/strict"
import test from "node:test"

import {
  parsePiSession,
  parsePiSessionEntries,
  searchableText,
  summarizePiEntries,
  toTranscriptEntries,
} from "./pi-session"

const file = "/tmp/pi-web-codex-test/session.jsonl"

function jsonl(...values: unknown[]) {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`
}

const header = {
  type: "session",
  version: 3,
  id: "native-session",
  timestamp: "2026-07-13T00:00:00.000Z",
  cwd: "/work/project",
}

test("reads the active Pi branch and pairs tool calls with their results", () => {
  const user = {
    type: "message",
    id: "user-1",
    parentId: null,
    timestamp: "2026-07-13T00:00:01.000Z",
    message: {
      role: "user",
      timestamp: Date.parse("2026-07-13T00:00:01.000Z"),
      content: [{ type: "text", text: "inspect the workspace" }],
    },
  }
  const assistant = {
    type: "message",
    id: "assistant-1",
    parentId: "user-1",
    timestamp: "2026-07-13T00:00:02.000Z",
    message: {
      role: "assistant",
      timestamp: Date.parse("2026-07-13T00:00:02.000Z"),
      content: [
        { type: "text", text: "I will inspect it." },
        {
          type: "toolCall",
          id: "call-1",
          name: "read",
          arguments: { path: "/work/project/package.json" },
        },
      ],
    },
  }
  const abandonedSibling = {
    type: "message",
    id: "assistant-abandoned",
    parentId: "user-1",
    timestamp: "2026-07-13T00:00:03.000Z",
    message: {
      role: "assistant",
      timestamp: Date.parse("2026-07-13T00:00:03.000Z"),
      content: [{ type: "text", text: "abandoned branch" }],
    },
  }
  const toolResult = {
    type: "message",
    id: "tool-1",
    parentId: "assistant-1",
    timestamp: "2026-07-13T00:00:04.000Z",
    message: {
      role: "toolResult",
      timestamp: Date.parse("2026-07-13T00:00:04.000Z"),
      toolCallId: "call-1",
      toolName: "read",
      content: [{ type: "text", text: '{"name":"project"}' }],
    },
  }

  const parsed = parsePiSession(
    file,
    jsonl(header, user, assistant, abandonedSibling, toolResult)
  )
  assert.deepEqual(
    parsed.activeBranch.map((entry) => entry.id),
    ["user-1", "assistant-1", "tool-1"]
  )
  assert.equal(parsed.firstMessage, "inspect the workspace")
  assert.equal(parsed.messageCount, 4)

  const transcript = toTranscriptEntries(parsed)
  assert.deepEqual(
    transcript.map((entry) => entry.id),
    ["user-1", "assistant-1", "tool-1"]
  )
  assert.match(searchableText(parsed.entries[1]!), /package\.json/)
})

test("incremental entry parsing preserves line numbers and metadata", () => {
  const appended = [
    {
      type: "session_info",
      id: "info-1",
      parentId: null,
      timestamp: "2026-07-13T00:00:01.000Z",
      name: "Named session",
    },
    {
      type: "message",
      id: "user-1",
      parentId: "info-1",
      timestamp: "2026-07-13T00:00:02.000Z",
      message: {
        role: "user",
        timestamp: Date.parse("2026-07-13T00:00:02.000Z"),
        content: "new question",
      },
    },
  ]
  const entries = parsePiSessionEntries(file, jsonl(...appended), 8)
  const metadata = summarizePiEntries(entries, {
    firstMessage: "",
    messageCount: 0,
    updatedAt: header.timestamp,
  })

  assert.equal(metadata.title, "Named session")
  assert.equal(metadata.firstMessage, "new question")
  assert.equal(metadata.messageCount, 1)
  assert.equal(metadata.updatedAt, "2026-07-13T00:00:02.000Z")

  assert.throws(
    () => parsePiSessionEntries(file, "not-json\n", 8),
    new RegExp(`${file}:8:`)
  )
})

test("rejects a session branch whose parent does not exist", () => {
  const orphan = {
    type: "message",
    id: "orphan",
    parentId: "missing",
    timestamp: "2026-07-13T00:00:01.000Z",
    message: { role: "user", content: "hello" },
  }

  assert.throws(
    () => parsePiSession(file, jsonl(header, orphan)),
    /references missing parent missing/
  )
})
