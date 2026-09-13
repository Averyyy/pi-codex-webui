import assert from "node:assert/strict"
import test from "node:test"
import { toolCallStatus } from "./tool-call-status"

test("a persisted tool without a result is incomplete, not running", () => {
  for (const status of ["ready", "busy", "stopped"] as const) {
    assert.deepEqual(toolCallStatus(null, undefined, status), {
      running: false,
      failed: false,
      incomplete: true,
    })
  }
})

test("stopping a runtime clears stale live running indicators, including partial results", () => {
  const tool = {
    id: "t",
    name: "bash",
    arguments: {},
    status: "running" as const,
    result: { parts: [] },
  }
  assert.equal(toolCallStatus(tool, undefined, "busy").running, true)
  assert.deepEqual(toolCallStatus(tool, undefined, "ready"), {
    running: false,
    failed: false,
    incomplete: true,
  })
})

test("completed and failed results retain their explicit state", () => {
  assert.deepEqual(toolCallStatus(null, { parts: [] }, "ready"), {
    running: false,
    failed: false,
    incomplete: false,
  })
  assert.deepEqual(
    toolCallStatus(null, { parts: [], isError: true }, "ready"),
    {
      running: false,
      failed: true,
      incomplete: false,
    }
  )
})
