import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "./api-response"
import {
  createSingleFlight,
  isRecoverableRuntimeDraftLeaseError,
  sameRuntimeDraftRequest,
} from "./runtime-draft-controller"

test("stale runtime draft responses fail the generation and target gate", () => {
  const current = {
    generation: 3,
    projectId: "project-b",
    draftId: "draft-b",
    leaseId: "lease-b",
  }

  assert.equal(
    sameRuntimeDraftRequest(
      { ...current, generation: 2, projectId: "project-a" },
      current
    ),
    false
  )
  assert.equal(
    sameRuntimeDraftRequest({ ...current, projectId: "project-a" }, current),
    false
  )
  assert.equal(sameRuntimeDraftRequest(current, current), true)
  assert.equal(sameRuntimeDraftRequest(current, null), false)
})

test("only explicit missing or expired draft leases request recovery", () => {
  assert.equal(
    isRecoverableRuntimeDraftLeaseError(
      new ApiError("expired", "RuntimeDraftLeaseNotFound")
    ),
    true
  )
  assert.equal(
    isRecoverableRuntimeDraftLeaseError(
      new ApiError("gone", "RuntimeDraftNotFound")
    ),
    true
  )
  assert.equal(
    isRecoverableRuntimeDraftLeaseError(
      new ApiError("unauthorized", "RuntimeDraftUnauthorized")
    ),
    false
  )
  assert.equal(isRecoverableRuntimeDraftLeaseError(new Error("network")), false)
})

test("concurrent draft lease refreshes share one request", async () => {
  let calls = 0
  let resolve!: (value: string) => void
  const pending = new Promise<string>((promiseResolve) => {
    resolve = promiseResolve
  })
  const flight = createSingleFlight<string>()

  const first = flight.run(async () => {
    calls += 1
    return pending
  })
  const second = flight.run(async () => {
    calls += 1
    return "unexpected"
  })

  assert.equal(first, second)
  assert.equal(calls, 0)
  resolve("refreshed")
  assert.equal(await first, "refreshed")
  assert.equal(
    await flight.run(async () => {
      calls += 1
      return "next"
    }),
    "next"
  )
  assert.equal(calls, 2)
})
