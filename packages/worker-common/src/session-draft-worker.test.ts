import assert from "node:assert/strict"
import { fork, type ChildProcess } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  runtimeSnapshotSchema,
  workerToHostMessageSchema,
  type HostToWorkerMessage,
  type RuntimeSnapshot,
} from "@workspace/runtime-protocol"

const root = path.resolve(import.meta.dirname, "../../..")

function startWorker(entry: string, environment: NodeJS.ProcessEnv) {
  return fork(path.join(root, entry), [], {
    cwd: root,
    env: environment,
    execArgv: process.execArgv,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  })
}

function request(
  child: ChildProcess,
  message: HostToWorkerMessage,
  predicate: (
    candidate: ReturnType<typeof workerToHostMessageSchema.parse>
  ) => boolean
) {
  return new Promise<ReturnType<typeof workerToHostMessageSchema.parse>>(
    (resolve, reject) => {
      const stderr: Buffer[] = []
      const timeout = setTimeout(() => {
        reject(new Error(`Worker timed out: ${Buffer.concat(stderr)}`))
      }, 30_000)
      const onMessage = (raw: unknown) => {
        const candidate = workerToHostMessageSchema.parse(raw)
        if (!predicate(candidate)) return
        clearTimeout(timeout)
        child.off("message", onMessage)
        resolve(candidate)
      }
      child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk))
      child.on("message", onMessage)
      child.send(message)
    }
  )
}

async function stopWorker(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve())
  )
  child.send({ type: "runtime.shutdown", requestId: randomUUID() })
  await exited
}

async function assertDraftWorker(
  entry: string,
  runtimeProfileId: string,
  environment: NodeJS.ProcessEnv
) {
  const directory = await mkdtemp(
    path.join(tmpdir(), "pi-worker-draft-runtime-")
  )
  const cwd = path.join(directory, "project")
  const agentDir = path.join(directory, "agent")
  const draftDirectory = path.join(directory, "draft-private")
  let child: ChildProcess | undefined
  let snapshot: RuntimeSnapshot | undefined
  try {
    await Promise.all([mkdir(cwd), mkdir(agentDir)])
    child = startWorker(entry, {
      ...process.env,
      ...environment,
      PI_CODING_AGENT_DIR: agentDir,
    })
    const webSessionId = randomUUID()
    const initialize = {
      type: "runtime.initialize" as const,
      requestId: randomUUID(),
      payload: {
        webSessionId,
        runtimeProfileId,
        cwd,
        agentDir,
        mcpTools: [],
        webuiAdapters: [],
        target: { mode: "new" as const },
        draft: true,
        draftDirectory,
      },
    }
    const ready = await request(
      child,
      initialize,
      (candidate) =>
        candidate.type === "runtime.ready" &&
        candidate.requestId === initialize.requestId
    )
    if (ready.type !== "runtime.ready")
      throw new Error("Worker did not become ready")
    snapshot = runtimeSnapshotSchema.parse(ready.payload)
    const privateSessionFile = path.join(
      draftDirectory,
      path.basename(snapshot.nativeSessionFile)
    )
    await stat(privateSessionFile)
    await assert.rejects(stat(snapshot.nativeSessionFile))
    const [privateHeader] = (await readFile(privateSessionFile, "utf8"))
      .trim()
      .split(/\r?\n/)
    assert.equal(JSON.parse(privateHeader!).id, snapshot.nativeSessionId)

    const promote = {
      type: "runtime.promote-session" as const,
      requestId: randomUUID(),
      payload: { nativeSessionFile: snapshot.nativeSessionFile },
    }
    const response = await request(
      child,
      promote,
      (candidate) =>
        candidate.type === "runtime.response" &&
        candidate.requestId === promote.requestId
    )
    assert.equal(response.type, "runtime.response")
    assert.equal(response.success, true)
    await stat(snapshot.nativeSessionFile)
    await assert.rejects(stat(privateSessionFile))
  } finally {
    if (child) await stopWorker(child)
    if (snapshot) await rm(snapshot.nativeSessionFile, { force: true })
    await rm(directory, { recursive: true, force: true })
  }
}

test("Pi worker promotes a draft without exposing its private session file", async () => {
  await assertDraftWorker("packages/worker-pi/src/worker.ts", "pi", {})
})

test("Pi Client worker promotes a draft without exposing its private session file", async () => {
  await assertDraftWorker(
    "packages/worker-pi-client/src/worker.ts",
    "pi-client-default",
    { PI_SERVER_URL: "http://127.0.0.1:9" }
  )
})
