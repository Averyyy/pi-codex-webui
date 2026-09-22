import assert from "node:assert/strict"
import test from "node:test"

import {
  AppUpdateError,
  canRecoverAppUpdate,
  fetchAppUpdateStatus,
  fetchHealthVersion,
  isUpdateReadyForReload,
  requestAppUpdate,
  updatePollDelay,
  type AppUpdateSnapshot,
} from "./app-update-client"

const snapshot: AppUpdateSnapshot = {
  supported: true,
  currentVersion: "0.1.18",
  latestVersion: "0.1.19",
  available: true,
  phase: "idle",
  error: null,
  operationId: null,
}

test("update status validates the complete server snapshot", async () => {
  const result = await fetchAppUpdateStatus(async () => Response.json(snapshot))
  assert.deepEqual(result, snapshot)

  await assert.rejects(
    fetchAppUpdateStatus(async () =>
      Response.json({ ...snapshot, phase: "unknown" })
    ),
    (failure: unknown) =>
      failure instanceof AppUpdateError &&
      failure.message === "Update service returned an invalid status snapshot."
  )
})

test("update requests send the exact target version and mutation token", async () => {
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined
  const result = await requestAppUpdate(
    "0.1.19",
    "mutation-token",
    async (input, init) => {
      request = { input, init }
      return Response.json(
        {
          ...snapshot,
          phase: "installing",
          operationId: "op-1",
        },
        { status: 202 }
      )
    }
  )

  assert.equal(result.operationId, "op-1")
  assert.equal(request?.input, "/api/v1/update")
  assert.equal(request?.init?.method, "POST")
  assert.equal(
    new Headers(request?.init?.headers).get("X-Pi-Web-Codex-Mutation-Token"),
    "mutation-token"
  )
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    version: "0.1.19",
  })
})

test("health readiness requires the Pi Web Codex identity and exact target", async () => {
  const responses = [
    Response.json({ status: "ok", name: "other", version: "0.1.19" }),
    Response.json({ status: "ok", name: "pi-web-codex", version: "0.1.18" }),
    Response.json({ status: "ok", name: "pi-web-codex", version: "0.1.19" }),
  ]
  const fetcher = async () => responses.shift()!

  assert.equal(await fetchHealthVersion(fetcher), null)
  assert.equal(await fetchHealthVersion(fetcher), "0.1.18")
  assert.equal(await fetchHealthVersion(fetcher), "0.1.19")
  assert.equal(
    isUpdateReadyForReload(
      { ...snapshot, phase: "succeeded", currentVersion: "0.1.19" },
      "0.1.19",
      "0.1.19"
    ),
    true
  )
  assert.equal(
    isUpdateReadyForReload(
      { ...snapshot, phase: "succeeded", currentVersion: "0.1.19" },
      "0.1.19",
      "0.1.18"
    ),
    false
  )
})

test("polling stays within the bounded one to two second interval", () => {
  assert.equal(updatePollDelay(0), 1_000)
  assert.equal(updatePollDelay(1), 1_500)
  assert.equal(updatePollDelay(2), 2_000)
  assert.equal(updatePollDelay(20), 2_000)
})

test("does not recover a persisted succeeded snapshot as a new operation", () => {
  assert.equal(
    canRecoverAppUpdate({
      ...snapshot,
      phase: "succeeded",
      operationId: "op-1",
    }),
    false
  )
  assert.equal(
    canRecoverAppUpdate({
      ...snapshot,
      phase: "restarting",
      operationId: "op-1",
    }),
    true
  )
})
