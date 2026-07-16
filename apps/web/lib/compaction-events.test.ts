import assert from "node:assert/strict"
import test from "node:test"

import { compactionEndOutcome } from "./compaction-events"

test("classifies a successful compaction event", () => {
  assert.deepEqual(compactionEndOutcome({ aborted: false, result: {} }), {
    kind: "complete",
  })
})

test("classifies a failed compaction event", () => {
  assert.deepEqual(
    compactionEndOutcome({
      aborted: false,
      result: undefined,
      errorMessage: "Auto-compaction failed: provider unavailable",
    }),
    { kind: "failed", message: "Auto-compaction failed: provider unavailable" }
  )
})

test("classifies an aborted compaction event", () => {
  assert.deepEqual(compactionEndOutcome({ aborted: true, result: undefined }), {
    kind: "aborted",
  })
})
