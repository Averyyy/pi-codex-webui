import assert from "node:assert/strict"
import test from "node:test"

import { nextArchiveFocusTarget } from "@/lib/archive-focus"

test("focus moves to the next archived session after removal", () => {
  assert.equal(nextArchiveFocusTarget(["a", "b", "c"], "b"), "c")
})

test("focus falls back to the previous archived session", () => {
  assert.equal(nextArchiveFocusTarget(["a", "b"], "b"), "a")
})

test("removing the only archived session targets the empty state", () => {
  assert.equal(nextArchiveFocusTarget(["a"], "a"), null)
})

test("an unknown archived session has no focus target", () => {
  assert.equal(nextArchiveFocusTarget(["a", "b"], "missing"), null)
})
