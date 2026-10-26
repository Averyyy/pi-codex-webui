import assert from "node:assert/strict"
import { fork } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { workerToHostMessageSchema } from "@workspace/runtime-protocol"

test("Pi Client worker drains its observer connection on shutdown", async (t) => {
  const root = path.resolve(import.meta.dirname, "../../..")
  const directory = await mkdtemp(path.join(tmpdir(), "pi-worker-shutdown-"))
  const agentDir = path.join(directory, "agent")
  const cwd = path.join(directory, "project")
  await Promise.all([mkdir(agentDir), mkdir(cwd)])
  let observerUpdates = 0
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/api/observer/connect?")) {
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.write(
        'event: connected\ndata: {"connectionId":"shutdown-test"}\n\n'
      )
      return
    }
    if (request.url === "/api/observer") {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk)
      assert.equal(
        JSON.parse(Buffer.concat(chunks).toString()).connectionId,
        "shutdown-test"
      )
      observerUpdates++
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ accepted: true }))
      return
    }
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ models: [], available: [], providers: [] }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const child = fork(
    path.join(root, "packages/worker-pi-client/src/worker.ts"),
    [],
    {
      cwd: root,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_CODING_AGENT_SESSION_DIR: path.join(agentDir, "sessions"),
        PI_SERVER_URL: `http://127.0.0.1:${address.port}`,
      },
      execArgv: process.execArgv,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    }
  )
  let stderr = ""
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const exited = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }))
  })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await exited
    }
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
    await rm(directory, { recursive: true, force: true })
  })
  const requestId = randomUUID()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Worker initialization timed out: ${stderr}`)),
      30_000
    )
    child.on("message", (raw: unknown) => {
      const message = workerToHostMessageSchema.parse(raw)
      if (message.type === "runtime.ready" && message.requestId === requestId) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.send({
      type: "runtime.initialize",
      requestId,
      payload: {
        webSessionId: randomUUID(),
        runtimeProfileId: "pi-client-default",
        cwd,
        agentDir,
        webuiAdapters: [],
        target: { mode: "new" },
      },
    })
  })
  const timeout = setTimeout(() => child.kill(), 10_000)
  child.send({ type: "runtime.shutdown", requestId: randomUUID() })
  const result = await exited
  clearTimeout(timeout)
  assert.deepEqual(result, { code: 0, signal: null }, stderr)
  assert.ok(observerUpdates > 0)
  assert.doesNotMatch(stderr, /UV_HANDLE_CLOSING|Assertion failed|ERR_IPC/)
})
