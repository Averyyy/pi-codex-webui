import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import test from "node:test"

import { waitForReady } from "../../../extensions/pi-web-codex"

function sendCliMessage(message: Record<string, string>) {
  return spawn(
    process.execPath,
    ["-e", `process.send(${JSON.stringify(message)})`],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] }
  )
}

test("extension readiness receives the CLI ready message", async () => {
  const child = sendCliMessage({ type: "ready", url: "http://127.0.0.1:1816" })
  try {
    assert.equal(await waitForReady(child), "http://127.0.0.1:1816")
  } finally {
    if (child.connected) child.disconnect()
    child.kill()
  }
})

test("extension readiness reports CLI errors", async () => {
  const child = sendCliMessage({ type: "error", message: "port is occupied" })
  try {
    await assert.rejects(waitForReady(child), /port is occupied/)
  } finally {
    if (child.connected) child.disconnect()
    child.kill()
  }
})
