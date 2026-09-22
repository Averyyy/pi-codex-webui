import assert from "node:assert/strict"
import test from "node:test"
import {
  canCollapseConversation,
  conversationActivityBlocks,
  conversationActivityBlockIsRunning,
  conversationActivityCommandCount,
  conversationActivityDisplayId,
  conversationRounds,
  partitionConversationRound,
} from "./conversation-rounds"
import type { TranscriptEntry, TranscriptPart } from "./session-types"

const text: TranscriptPart = { type: "text", text: "Progress" }
const thought: TranscriptPart = {
  type: "thinking",
  text: "Check first",
  redacted: false,
}
const tool: TranscriptPart = {
  type: "toolCall",
  id: "tool-1",
  name: "bash",
  arguments: { command: "echo ok" },
}
function assistant(
  id: string,
  parts: TranscriptPart[],
  stopReason?: string,
  phase?: string
): Extract<TranscriptEntry, { kind: "message" }> {
  return {
    kind: "message",
    id,
    role: "assistant",
    parts,
    timestamp: "2026-09-12T01:00:00Z",
    metadata: { stopReason, phase },
  }
}

test("tool-use commentary is activity even when text precedes the call", () => {
  const round = partitionConversationRound([
    assistant("a", [text, tool], "toolUse"),
  ])
  assert.equal(round.response, undefined)
  assert.equal(round.process.length, 1)
  assert.equal(canCollapseConversation(false, round.outcome), false)
})

test("unmarked text and explicit commentary are never guessed to be final", () => {
  for (const message of [
    assistant("a", [text]),
    assistant("a", [text], "stop", "commentary"),
  ]) {
    assert.equal(partitionConversationRound([message]).response, undefined)
  }
})

test("a later tool-only assistant invalidates an earlier final candidate", () => {
  const round = partitionConversationRound([
    assistant("a", [text], "stop"),
    assistant("b", [tool], "toolUse"),
  ])
  assert.equal(round.response, undefined)
  assert.equal(round.process.length, 2)
})

test("thinking after text remains in activity; all response content is preserved once", () => {
  const image: TranscriptPart = {
    type: "image",
    data: "AA==",
    mimeType: "image/png",
  }
  const round = partitionConversationRound([
    assistant("a", [text, thought, image], "stop"),
  ])
  assert.deepEqual(round.process[0]?.parts, [thought])
  assert.deepEqual(round.response?.parts, [text, image])
  assert.equal(canCollapseConversation(true, round.outcome), true)
})

test("cancelled empty replies remain visible and cannot auto-collapse activity", () => {
  const round = partitionConversationRound([
    assistant("a", [tool], "toolUse"),
    assistant("b", [], "aborted"),
  ])
  assert.equal(round.response?.id, "b")
  assert.equal(round.outcome, "stopped")
  assert.equal(canCollapseConversation(true, round.outcome), false)
})

test("thinking-only and blank successful messages cannot hide activity behind an empty final", () => {
  for (const parts of [
    [thought],
    [thought, { type: "text" as const, text: "  " }],
  ]) {
    const round = partitionConversationRound([assistant("a", parts, "stop")])
    assert.equal(round.response, undefined)
    assert.equal(round.process.length, 1)
  }
})

test("provider errors and length limits are not labeled complete", () => {
  assert.equal(
    partitionConversationRound([
      assistant("a", [{ type: "error", text: "Unavailable" }], "error"),
    ]).outcome,
    "failed"
  )
  assert.equal(
    partitionConversationRound([assistant("a", [text], "length")]).outcome,
    "incomplete"
  )
})

test("live final phase stays open until the round has finished", () => {
  const round = partitionConversationRound([
    {
      id: 1,
      role: "assistant",
      parts: [thought],
      complete: true,
      stopReason: "toolUse",
    },
    {
      id: 2,
      role: "assistant",
      parts: [text],
      complete: false,
      phase: "final_answer",
    },
  ])
  assert.equal(round.response?.id, 2)
  assert.equal(round.outcome, "pending")
  assert.equal(canCollapseConversation(true, round.outcome), false)
})

test("a live final answer keeps the outer process open until runtime ends", () => {
  assert.equal(canCollapseConversation(true, "pending", true), false)
  assert.equal(canCollapseConversation(true, "complete", true), false)
  assert.equal(canCollapseConversation(true, "complete", false), true)
})

test("live messages use the same completion contract as persisted messages", () => {
  const round = partitionConversationRound([
    {
      id: 1,
      role: "assistant",
      parts: [text, tool],
      complete: true,
      stopReason: "toolUse",
    },
    {
      id: 2,
      role: "assistant",
      parts: [thought, text],
      complete: true,
      stopReason: "stop",
    },
  ])
  assert.equal(round.process.length, 2)
  assert.deepEqual(round.response?.parts, [text])
  assert.equal(round.outcome, "complete")
})

test("steered user messages begin a new visible round instead of being folded into activity", () => {
  const items = [
    { id: 1, role: "user", parts: [text] },
    { id: 2, role: "assistant", parts: [tool] },
    { id: 3, role: "user", parts: [text] },
    { id: 4, role: "assistant", parts: [text], stopReason: "stop" },
  ]
  const rounds = conversationRounds(items).map(partitionConversationRound)
  assert.deepEqual(
    rounds.map((round) => round.leading[0]?.id),
    [1, 3]
  )
  assert.equal(rounds[0]?.response, undefined)
  assert.equal(rounds[1]?.response?.id, 4)
})

test("events after the response keep their order outside the activity group", () => {
  const event: TranscriptEntry = {
    kind: "event",
    id: "event",
    timestamp: "2026-09-12T01:00:00Z",
    eventType: "compaction",
    title: "Compacted",
  }
  const round = partitionConversationRound([
    assistant("a", [thought, text], "stop"),
    event,
  ])
  assert.deepEqual(round.trailing, [event])
})

test("activity grouping keeps commentary around consecutive thinking and tools", () => {
  const blocks = conversationActivityBlocks([
    assistant("a", [text, tool, { ...text, text: "After command" }], "toolUse"),
    assistant("b", [thought], "toolUse"),
    assistant("c", [text], "commentary"),
  ])

  assert.deepEqual(
    blocks.map((block) => [
      block.type,
      block.fragments.map((fragment) =>
        fragment.parts.map((part) => part.type)
      ),
    ]),
    [
      ["commentary", [["text"]]],
      ["activity", [["toolCall"]]],
      ["commentary", [["text"]]],
      ["activity", [["thinking"]]],
      ["commentary", [["text"]]],
    ]
  )
  assert.deepEqual(blocks[0]?.fragments[0]?.key, "a:0")
})

test("bash execution is an activity block even though its parts are text", () => {
  const bash: TranscriptEntry = {
    kind: "message",
    id: "bash-1",
    timestamp: "2026-09-12T01:00:00Z",
    role: "bashExecution",
    parts: [text],
  }
  const blocks = conversationActivityBlocks([bash])
  assert.equal(blocks[0]?.type, "activity")
  assert.deepEqual(blocks[0]?.fragments[0]?.parts, [text])
  assert.equal(
    blocks[0]?.type === "activity"
      ? conversationActivityCommandCount(blocks[0])
      : 0,
    1
  )
})

test("split activity fragments keep one canonical entry anchor", () => {
  const [block] = conversationActivityBlocks([
    assistant("same", [thought, text], "stop"),
  ])
  assert.equal(block?.type, "activity")
  const fragment = block?.fragments[0]
  assert.equal(
    fragment && conversationActivityDisplayId(fragment, "same", "activity"),
    "same:process"
  )
  assert.equal(
    fragment && conversationActivityDisplayId(fragment, undefined, "activity"),
    "same"
  )
})

test("activity running state follows the source tail and explicit tool ids", () => {
  const staleThinking = conversationActivityBlocks([
    {
      ...assistant("stale", [thought, text], "toolUse"),
      complete: false,
    },
  ])[0]
  assert.equal(staleThinking?.type, "activity")
  assert.equal(
    staleThinking &&
      conversationActivityBlockIsRunning(staleThinking, new Set(), true),
    false
  )

  const parallel = conversationActivityBlocks([
    { ...assistant("a", [tool], "toolUse"), complete: true },
    {
      ...assistant("b", [{ ...tool, id: "tool-b" }], "toolUse"),
      complete: true,
    },
  ])[0]
  assert.equal(parallel?.type, "activity")
  assert.equal(
    parallel &&
      conversationActivityBlockIsRunning(parallel, new Set(["tool-1"]), true),
    true
  )
  assert.equal(
    parallel &&
      conversationActivityBlockIsRunning(parallel, new Set(["tool-1"]), false),
    false
  )
})
