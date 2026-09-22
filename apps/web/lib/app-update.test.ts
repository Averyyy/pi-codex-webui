import assert from "node:assert/strict"
import test from "node:test"

import { APP_VERSION } from "./app"
import {
  AppUpdateProxyError,
  getAppUpdateStatus,
  requestAppUpdate,
} from "./app-update"

const envKeys = [
  "PI_WEB_CODEX_UPDATE_CONTROL_URL",
  "PI_WEB_CODEX_UPDATE_CONTROL_TOKEN",
] as const

function saveEnvironment() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
}

function restoreEnvironment(previous: Record<string, string | undefined>) {
  for (const key of envKeys) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test("source mode reports an explicit unsupported update status", async () => {
  const previous = saveEnvironment()
  delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL
  delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN
  try {
    assert.deepEqual(await getAppUpdateStatus(), {
      supported: false,
      currentVersion: APP_VERSION,
      latestVersion: null,
      available: false,
      phase: "idle",
      error:
        "Application updates are unavailable because the packaged update supervisor is not configured.",
      operationId: null,
    })
  } finally {
    restoreEnvironment(previous)
  }
})
test("configured update control is loopback authenticated and proxied", async () => {
  const previous = saveEnvironment()
  const previousFetch = globalThis.fetch
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL = "http://127.0.0.1:43210/"
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = "control-secret"
  const calls: { url: string; init?: RequestInit }[] = []
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init })
    if (String(input).endsWith("/status")) {
      return new Response(
        JSON.stringify({
          supported: true,
          currentVersion: APP_VERSION,
          latestVersion: "0.1.19",
          available: true,
          phase: "idle",
          error: null,
          operationId: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    }
    return new Response(JSON.stringify({ ok: true }), { status: 202 })
  }) as typeof fetch

  try {
    assert.equal((await getAppUpdateStatus()).latestVersion, "0.1.19")
    assert.deepEqual(await requestAppUpdate("0.1.19"), {
      status: 202,
      body: { ok: true },
    })
    assert.equal(calls.length, 2)
    for (const call of calls) {
      assert.match(call.url, /^http:\/\/127\.0\.0\.1:43210\/(?:status|update)$/)
      assert.equal(
        new Headers(call.init?.headers).get("authorization"),
        "Bearer control-secret"
      )
    }
    assert.equal(JSON.stringify(calls).includes("control-secret"), true)
  } finally {
    globalThis.fetch = previousFetch
    restoreEnvironment(previous)
  }
})

test("a configured non-loopback control endpoint fails explicitly", async () => {
  const previous = saveEnvironment()
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL = "https://updates.example.test"
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = "control-secret"
  try {
    await assert.rejects(
      () => getAppUpdateStatus(),
      (error: unknown) =>
        error instanceof AppUpdateProxyError &&
        error.code === "UpdateControlInvalid" &&
        error.status === 503
    )
  } finally {
    restoreEnvironment(previous)
  }
})
