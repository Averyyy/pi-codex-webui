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

test("exposes user-message branch position and branch-tip navigation", () => {
  const firstQuestion = {
    type: "message",
    id: "user-first",
    parentId: null,
    timestamp: "2026-07-13T00:00:01.000Z",
    message: { role: "user", content: "first wording" },
  }
  const firstAnswer = {
    type: "message",
    id: "assistant-first",
    parentId: "user-first",
    timestamp: "2026-07-13T00:00:02.000Z",
    message: { role: "assistant", content: "first answer" },
  }
  const editedQuestion = {
    type: "message",
    id: "user-edited",
    parentId: null,
    timestamp: "2026-07-13T00:00:03.000Z",
    message: { role: "user", content: "edited wording" },
  }
  const editedAnswer = {
    type: "message",
    id: "assistant-edited",
    parentId: "user-edited",
    timestamp: "2026-07-13T00:00:04.000Z",
    message: { role: "assistant", content: "edited answer" },
  }

  const editedTranscript = toTranscriptEntries(
    parsePiSession(
      file,
      jsonl(header, firstQuestion, firstAnswer, editedQuestion, editedAnswer)
    )
  )
  assert.deepEqual(editedTranscript[0], {
    kind: "message",
    id: "user-edited",
    timestamp: editedQuestion.timestamp,
    role: "user",
    parts: [{ type: "text", text: "edited wording" }],
    isError: false,
    toolCallId: undefined,
    toolName: undefined,
    details: undefined,
    metadata: editedQuestion.message,
    branch: {
      index: 2,
      total: 2,
      previousEntryId: "assistant-first",
    },
  })

  const activeMarker = {
    type: "model_change",
    id: "model-active",
    parentId: "assistant-first",
    timestamp: "2026-07-13T00:00:05.000Z",
    provider: "provider",
    modelId: "model",
  }
  const firstTranscript = toTranscriptEntries(
    parsePiSession(
      file,
      jsonl(
        header,
        firstQuestion,
        firstAnswer,
        editedQuestion,
        editedAnswer,
        activeMarker
      )
    )
  )
  assert.deepEqual(
    firstTranscript[0]?.kind === "message" && firstTranscript[0].branch,
    {
      index: 1,
      total: 2,
      nextEntryId: "assistant-edited",
    }
  )

  const selectedBranch = parsePiSession(
    file,
    jsonl(header, firstQuestion, firstAnswer, editedQuestion, editedAnswer),
    "assistant-first"
  )
  assert.deepEqual(
    selectedBranch.activeBranch.map((entry) => entry.id),
    ["user-first", "assistant-first"]
  )
  assert.deepEqual(
    toTranscriptEntries(selectedBranch).map((entry) => entry.id),
    ["user-first", "assistant-first"]
  )
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

test("uses goal state as metadata without exposing its control prompt", () => {
  const goalState = {
    type: "custom",
    id: "goal-state-1",
    parentId: null,
    timestamp: "2026-07-13T00:00:01.000Z",
    customType: "goal-state",
    data: {
      goal: {
        id: "goal-1",
        text: "Fix every frontend issue",
        status: "active",
        startedAt: 1,
        updatedAt: 2,
        iteration: 0,
        tokensUsed: 0,
        timeUsedSeconds: 0,
      },
    },
  }
  const controlPrompt = {
    type: "message",
    id: "goal-prompt-1",
    parentId: "goal-state-1",
    timestamp: "2026-07-13T00:00:02.000Z",
    message: {
      role: "user",
      timestamp: Date.parse("2026-07-13T00:00:02.000Z"),
      content:
        "Internal goal instructions\n\n<!-- pi-goal-prompt:owned-marker -->",
    },
  }
  const assistant = {
    type: "message",
    id: "assistant-goal-1",
    parentId: "goal-wrap-up-1",
    timestamp: "2026-07-13T00:00:03.000Z",
    message: {
      role: "assistant",
      timestamp: Date.parse("2026-07-13T00:00:03.000Z"),
      content: "Working on it.",
    },
  }
  const wrapUp = {
    type: "message",
    id: "goal-wrap-up-1",
    parentId: "goal-prompt-1",
    timestamp: "2026-07-13T00:00:02.500Z",
    message: {
      role: "custom",
      customType: "goal-budget-wrap-up",
      content: "Internal budget wrap-up instructions",
      display: true,
      details: { goalId: "goal-1" },
    },
  }

  const parsed = parsePiSession(
    file,
    jsonl(header, goalState, controlPrompt, wrapUp, assistant)
  )

  assert.equal(parsed.firstMessage, "Fix every frontend issue")
  assert.equal(parsed.messageCount, 1)
  assert.deepEqual(
    toTranscriptEntries(parsed).map((entry) => entry.id),
    ["assistant-goal-1"]
  )
  assert.equal(searchableText(parsed.entries[0]!), "Fix every frontend issue")
  assert.equal(searchableText(parsed.entries[1]!), "")
  assert.equal(searchableText(parsed.entries[2]!), "")
})

test("keeps display-false custom messages out of transcripts and search", () => {
  const hidden = {
    type: "message",
    id: "hidden-custom-1",
    parentId: null,
    timestamp: "2026-07-13T00:00:01.000Z",
    message: {
      role: "custom",
      customType: "internal-status",
      content: "internal only",
      display: false,
    },
  }
  const parsed = parsePiSession(file, jsonl(header, hidden))

  assert.equal(parsed.messageCount, 0)
  assert.deepEqual(toTranscriptEntries(parsed), [])
  assert.equal(searchableText(parsed.entries[0]!), "")
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
  assert.throws(
    () => parsePiSession(file, jsonl(header, orphan), "unknown-leaf"),
    /active leaf unknown-leaf does not exist/
  )
})
