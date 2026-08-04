import assert from "node:assert/strict"
import test from "node:test"

import { createTranslator } from "@/lib/i18n"
import { searchEntryTypeLabel, searchResultHref } from "./search-result-display"

test("presents indexed entry types as Chinese result labels", () => {
  assert.equal(searchEntryTypeLabel("session_title"), "标题")
  assert.equal(searchEntryTypeLabel("message"), "消息")
  assert.equal(searchEntryTypeLabel("tool"), "工具")
  assert.equal(searchEntryTypeLabel("branch_summary"), "分支摘要")
  assert.equal(searchEntryTypeLabel("custom"), "目标")
  assert.equal(searchEntryTypeLabel("future_entry"), "记录")
})

test("presents indexed entry types in the selected locale", () => {
  const t = createTranslator("en-US")

  assert.equal(searchEntryTypeLabel("session_title", t), "Title")
  assert.equal(searchEntryTypeLabel("message", t), "Message")
  assert.equal(searchEntryTypeLabel("tool", t), "Tool")
  assert.equal(searchEntryTypeLabel("branch_summary", t), "Branch summary")
  assert.equal(searchEntryTypeLabel("custom", t), "Goal")
  assert.equal(searchEntryTypeLabel("future_entry", t), "Record")
})

test("links every rendered transcript entry to its anchor", () => {
  const sessionHref = "/tasks/session-1"

  assert.equal(
    searchResultHref(sessionHref, {
      entryId: "message/with#separator",
      entryType: "message",
    }),
    "/tasks/session-1#entry-message%2Fwith%23separator"
  )
  assert.equal(
    searchResultHref(sessionHref, {
      entryId: "model-change-1",
      entryType: "model_change",
    }),
    "/tasks/session-1#entry-model-change-1"
  )
  assert.equal(
    searchResultHref(sessionHref, {
      entryId: "thinking-level-change-1",
      entryType: "thinking_level_change",
    }),
    "/tasks/session-1#entry-thinking-level-change-1"
  )
  assert.equal(
    searchResultHref(sessionHref, {
      entryId: "future-event-1",
      entryType: "future_event",
    }),
    "/tasks/session-1#entry-future-event-1"
  )
})

test("falls back only for entries omitted from the transcript", () => {
  const sessionHref = "/tasks/session-1"

  assert.equal(
    searchResultHref(sessionHref, {
      entryId: "goal-state-1",
      entryType: "custom",
    }),
    sessionHref
  )
  for (const entryType of ["label", "session_info"]) {
    assert.equal(
      searchResultHref(sessionHref, {
        entryId: `${entryType}-1`,
        entryType,
      }),
      sessionHref
    )
  }
  assert.equal(
    searchResultHref(sessionHref, {
      entryId: null,
      entryType: "session_title",
    }),
    sessionHref
  )
})
