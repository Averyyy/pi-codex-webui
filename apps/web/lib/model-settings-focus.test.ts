import assert from "node:assert/strict"
import test from "node:test"

import { nextModelProviderFocusTarget } from "@/lib/model-settings-focus"

test("provider removal focuses the next provider summary", () => {
  assert.equal(nextModelProviderFocusTarget(["a", "b", "c"], "b"), "c")
})

test("provider removal falls back to the previous provider or add button", () => {
  assert.equal(nextModelProviderFocusTarget(["a", "b"], "b"), "a")
  assert.equal(nextModelProviderFocusTarget(["a"], "a"), null)
})
