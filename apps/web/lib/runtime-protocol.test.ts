import assert from "node:assert/strict"
import test from "node:test"

import {
  hostToWorkerMessageSchema,
  promptAcceptedSchema,
  runtimeStatusSchema,
  workerToHostMessageSchema,
} from "@workspace/runtime-protocol"

import { runtimeErrorResponse } from "./runtime-api"
import { isRuntimeRequestError } from "./runtime-error"

test("runtime status accepts only supervisor states", () => {
  assert.equal(runtimeStatusSchema.parse("busy"), "busy")
  assert.equal(runtimeStatusSchema.safeParse("running").success, false)
})

test("IPC schemas reject uncorrelated requests and responses", () => {
  assert.equal(
    hostToWorkerMessageSchema.safeParse({
      type: "session.abort",
      sessionId: "session-a",
    }).success,
    false
  )
  assert.equal(
    workerToHostMessageSchema.safeParse({
      type: "runtime.response",
      success: true,
    }).success,
    false
  )
})

test("prompt acceptance records whether Pi queued the message", () => {
  assert.deepEqual(
    promptAcceptedSchema.parse({ accepted: true, queued: true }),
    {
      accepted: true,
      queued: true,
    }
  )
  assert.equal(
    promptAcceptedSchema.safeParse({ accepted: true }).success,
    false
  )
})

test("runtime errors survive server bundle boundaries", async () => {
  const error = {
    isPiWebCodexRuntimeRequestError: true,
    code: "RuntimeNotActive",
    message: "The Pi runtime is not active.",
  }
  assert.equal(isRuntimeRequestError(error), true)

  const response = runtimeErrorResponse(error)
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), {
    error: "The Pi runtime is not active.",
    code: "RuntimeNotActive",
  })
})
