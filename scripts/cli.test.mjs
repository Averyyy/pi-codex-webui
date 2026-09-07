import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const root = path.resolve(import.meta.dirname, "..")
const cli = path.join(root, "bin", "pi-web-codex.mjs")
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
)

function listenHealthServer() {
  let response = {
    status: 200,
    body: JSON.stringify({
      name: "pi-web-codex",
      version: packageJson.version,
    }),
  }
  const server = createServer((request, res) => {
    if (request.url !== "/api/v1/health") {
      res.writeHead(404)
      res.end("not found")
      return
    }
    res.writeHead(response.status, { "Content-Type": "application/json" })
    res.end(response.body)
  })
  const ready = new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      assert.ok(address && typeof address === "object")
      resolve(address.port)
    })
  })
  return {
    server,
    ready,
    setResponse(next) {
      response = next
    },
  }
}

function runCli(port, configDir) {
  const child = spawn(
    process.execPath,
    [cli, "--no-open", "--port", String(port), "--config-dir", configDir],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] }
  )
  let output = ""
  child.stdout.on("data", (chunk) => (output += chunk.toString()))
  child.stderr.on("data", (chunk) => (output += chunk.toString()))
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal, output }))
  })
}

test("CLI diagnoses version conflicts and non-JSON occupied ports", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "pi-web-cli-test-"))
  const health = listenHealthServer()
  try {
    const port = await health.ready
    health.setResponse({
      status: 200,
      body: JSON.stringify({ name: "pi-web-codex", version: "0.0.0" }),
    })
    const mismatch = await runCli(port, path.join(temporary, "mismatch"))
    assert.equal(mismatch.code, 1)
    assert.match(
      mismatch.output,
      new RegExp(`already running at http://127\\.0\\.0\\.1:${port}`)
    )
    assert.match(mismatch.output, /Stop the existing instance before starting/)

    health.setResponse({ status: 500, body: "not JSON" })
    const occupied = await runCli(port, path.join(temporary, "occupied"))
    assert.equal(occupied.code, 1)
    assert.match(occupied.output, new RegExp(`Port ${port} is already in use`))

    health.setResponse({
      status: 200,
      body: JSON.stringify({
        name: "pi-web-codex",
        version: packageJson.version,
      }),
    })
    const sameVersion = await runCli(port, path.join(temporary, "same"))
    assert.equal(sameVersion.code, 0)
    assert.match(
      sameVersion.output,
      new RegExp(`pi-web-codex is ready at http://127\\.0\\.0\\.1:${port}`)
    )
  } finally {
    await new Promise((resolve) => health.server.close(resolve))
    await rm(temporary, { recursive: true, force: true })
  }
})
