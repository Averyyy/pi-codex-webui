import assert from "node:assert/strict"
import test from "node:test"

import { searchEntryTypeLabel } from "./search-result-display"

test("presents indexed entry types as Chinese result labels", () => {
  assert.equal(searchEntryTypeLabel("session_title"), "标题")
  assert.equal(searchEntryTypeLabel("message"), "消息")
  assert.equal(searchEntryTypeLabel("tool"), "工具")
  assert.equal(searchEntryTypeLabel("branch_summary"), "分支摘要")
  assert.equal(searchEntryTypeLabel("future_entry"), "记录")
})
