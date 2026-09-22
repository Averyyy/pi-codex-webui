import assert from "node:assert/strict"
import test from "node:test"

import { GET, POST } from "../app/api/v1/update/route"
import { DELETE as cancelPreparation } from "../app/api/v1/update/prepare/route"
import { getMutationToken } from "./request-security"
import {
  beginUpdatePreparation,
  resetUpdateMaintenanceForTests,
} from "./update-maintenance"

const host = "127.0.0.1:1816"

function saveEnv() {
  return {
    url: process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL,
    token: process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN,
  }
}

function restoreEnv(previous: ReturnType<typeof saveEnv>) {
  if (previous.url === undefined)
    delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL
  else process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL = previous.url
  if (previous.token === undefined)
    delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN
  else process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = previous.token
}

function mutationRequest(body: unknown) {
  return new Request(`http://${host}/api/v1/update`, {
    method: "POST",
    headers: {
      host,
      origin: `http://${host}`,
      "content-type": "application/json",
      "x-pi-web-codex-mutation-token": getMutationToken(),
    },
    body: JSON.stringify(body),
  })
}

test.afterEach(() => {
  resetUpdateMaintenanceForTests()
})

test("update status reports source mode without a supervisor", async () => {
  const previous = saveEnv()
  delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL
  delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN
  try {
    const response = await GET()
    assert.equal(response.status, 200)
    assert.equal((await response.json()).supported, false)
    assert.equal(response.headers.get("cache-control"), "no-store")
  } finally {
    restoreEnv(previous)
  }
})

test("update request validates the exact body before proxying", async () => {
  const response = await POST(
    mutationRequest({ version: "0.1.19", extra: true })
  )
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, "InvalidUpdateRequest")
})

test("authenticated update requests proxy the supervisor response", async () => {
  const previous = saveEnv()
  const previousFetch = globalThis.fetch
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL = "http://127.0.0.1:43210"
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = "control-secret"
  let authorization = ""
  globalThis.fetch = (async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? ""
    return Response.json({ ok: true }, { status: 202 })
  }) as typeof fetch
  try {
    const response = await POST(mutationRequest({ version: "0.1.19" }))
    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), { ok: true })
    assert.equal(authorization, "Bearer control-secret")
  } finally {
    globalThis.fetch = previousFetch
    restoreEnv(previous)
  }
})

test("prepare cancellation requires the owning operation ID", async () => {
  const previous = process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = "control-secret"
  const operationId = beginUpdatePreparation()
  try {
    const response = await cancelPreparation(
      new Request(`http://${host}/api/v1/update/prepare`, {
        method: "DELETE",
        headers: {
          host,
          authorization: "Bearer control-secret",
        },
      })
    )
    assert.equal(response.status, 409)

    const cancelled = await cancelPreparation(
      new Request(`http://${host}/api/v1/update/prepare`, {
        method: "DELETE",
        headers: {
          host,
          authorization: "Bearer control-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ operationId }),
      })
    )
    assert.equal(cancelled.status, 200)
    assert.deepEqual(await cancelled.json(), { ok: true, cancelled: true })
  } finally {
    if (previous === undefined)
      delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN
    else process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = previous
  }
})
