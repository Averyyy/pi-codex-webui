import assert from "node:assert/strict"
import test from "node:test"

import {
  createSessionSearchPlan,
  exactSubstringSearchSnippet,
  normalizeSessionSearchQuery,
  sessionSearchContainsExactSubstring,
} from "./session-search-query"

test("normalizes unsupported null bytes before search reaches SQLite", () => {
  assert.equal(
    normalizeSessionSearchQuery("  compact\0maxsim\n rerank  "),
    "compact maxsim rerank"
  )
  assert.equal(normalizeSessionSearchQuery("\0"), "")
})

test("uses trigram search from three Unicode code points", () => {
  assert.deepEqual(createSessionSearchPlan("UI 实际调用 🙂🙂 🙂🙂🙂"), {
    normalizedQuery: "UI 实际调用 🙂🙂 🙂🙂🙂",
    indexedTerms: ["实际调用", "🙂🙂🙂"],
    exactSubstringTerms: ["UI", "🙂🙂"],
    matchQuery: '"实际调用" AND "🙂🙂🙂"',
  })
})

test("keeps double quotes as keyword delimiters from the previous tokenizer", () => {
  assert.equal(
    createSessionSearchPlan('compact "quoted"').matchQuery,
    '"compact" AND "quoted"'
  )
})

test("short substring matching is case-insensitive and produces focused context", () => {
  assert.equal(sessionSearchContainsExactSubstring("Use the UI", "ui"), true)
  assert.equal(sessionSearchContainsExactSubstring("backend", "UI"), false)
  assert.equal(
    exactSubstringSearchSnippet(
      `${"prefix ".repeat(20)}Use the UI for this flow${" suffix".repeat(20)}`,
      "ui"
    ).includes("【UI】"),
    true
  )
})

test("returns an empty plan for a blank normalized query", () => {
  assert.deepEqual(createSessionSearchPlan(" \0 "), {
    normalizedQuery: "",
    indexedTerms: [],
    exactSubstringTerms: [],
    matchQuery: null,
  })
  assert.deepEqual(createSessionSearchPlan('""'), {
    normalizedQuery: '""',
    indexedTerms: [],
    exactSubstringTerms: [],
    matchQuery: null,
  })
})
