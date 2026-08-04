import assert from "node:assert/strict"
import test from "node:test"

import { sessionStatsSchema } from "@workspace/runtime-protocol"

test("session stats accepts unknown context usage after compaction", () => {
  const stats = sessionStatsSchema.parse({
    sessionId: "session-1",
    userMessages: 1,
    assistantMessages: 1,
    toolCalls: 0,
    toolResults: 0,
    totalMessages: 2,
    tokens: {
      input: 10,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      total: 12,
    },
    cost: 0,
    contextUsage: {
      tokens: null,
      contextWindow: 128_000,
      percent: null,
    },
  })

  assert.deepEqual(stats.contextUsage, {
    tokens: null,
    contextWindow: 128_000,
    percent: null,
  })
})

test("session stats rejects partially known context usage", () => {
  const base = {
    sessionId: "session-1",
    userMessages: 1,
    assistantMessages: 1,
    toolCalls: 0,
    toolResults: 0,
    totalMessages: 2,
    tokens: {
      input: 10,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
      total: 12,
    },
    cost: 0,
  }

  assert.equal(
    sessionStatsSchema.safeParse({
      ...base,
      contextUsage: {
        tokens: null,
        contextWindow: 128_000,
        percent: 1,
      },
    }).success,
    false
  )
  assert.equal(
    sessionStatsSchema.safeParse({
      ...base,
      contextUsage: {
        tokens: 1_280,
        contextWindow: 128_000,
        percent: null,
      },
    }).success,
    false
  )
})
