import assert from "node:assert/strict"
import { fork, type ChildProcess } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
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

function requestReady(
  child: ChildProcess,
  message: Extract<HostToWorkerMessage, { type: "runtime.initialize" }>
) {
  return new Promise<RuntimeSnapshot>((resolve, reject) => {
    const stderr: Buffer[] = []
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk))
    const timeout = setTimeout(
      () => reject(new Error(`Worker timed out: ${Buffer.concat(stderr)}`)),
      30_000
    )
    child.on("message", (raw: unknown) => {
      const parsed = workerToHostMessageSchema.parse(raw)
      if (parsed.type === "runtime.fatal") {
        clearTimeout(timeout)
        reject(new Error(parsed.error.message))
      } else if (
        parsed.type === "runtime.ready" &&
        parsed.requestId === message.requestId
      ) {
        clearTimeout(timeout)
        resolve(runtimeSnapshotSchema.parse(parsed.payload))
      } else if (
        parsed.type === "runtime.response" &&
        parsed.requestId === message.requestId &&
        !parsed.success
      ) {
        clearTimeout(timeout)
        reject(
          new Error(parsed.error?.message ?? "Worker initialization failed.")
        )
      }
    })
    child.send(message)
  })
}

async function stopWorker(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve())
  )
  child.send({ type: "runtime.shutdown", requestId: randomUUID() })
  await exited
}

test("Pi Client duplicates into its own worker without changing the source", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-web-worker-"))
  const cwd = path.join(directory, "project")
  const agentDir = path.join(directory, "agent")
  await Promise.all([mkdir(cwd), mkdir(agentDir)])
  const baseEnvironment = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
  }
  const pi = startWorker("packages/worker-pi/src/worker.ts", baseEnvironment)
  const piSnapshot = await requestReady(pi, {
    type: "runtime.initialize",
    requestId: randomUUID(),
    payload: {
      webSessionId: randomUUID(),
      runtimeProfileId: "pi",
      cwd,
      agentDir,
      mcpTools: [
        {
          serverId: "fixture",
          serverName: "Fixture",
          toolName: "echo",
          name: "mcp__fixture__echo",
          title: "Echo",
          description: "Echo a value.",
          inputSchema: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
          },
        },
      ],
      webuiAdapters: [],
      target: { mode: "new" },
    },
  })
  assert.equal(typeof piSnapshot.leafId, "string")
  assert.equal(piSnapshot.activeTools.includes("mcp__fixture__echo"), true)
  await stopWorker(pi)

  const sourceBefore = await readFile(piSnapshot.nativeSessionFile)
  const client = startWorker("packages/worker-pi-client/src/worker.ts", {
    ...baseEnvironment,
    PI_SERVER_URL: "http://127.0.0.1:9",
  })
  const clientSnapshot = await requestReady(client, {
    type: "runtime.initialize",
    requestId: randomUUID(),
    payload: {
      webSessionId: randomUUID(),
      runtimeProfileId: "pi-client-default",
      cwd,
      agentDir,
      mcpTools: [],
      webuiAdapters: [],
      target: {
        mode: "duplicate",
        sourceSessionFile: piSnapshot.nativeSessionFile,
      },
    },
  })
  await stopWorker(client)

  const sourceAfter = await readFile(piSnapshot.nativeSessionFile)
  assert.notEqual(clientSnapshot.nativeSessionId, piSnapshot.nativeSessionId)
  assert.notEqual(
    clientSnapshot.nativeSessionFile,
    piSnapshot.nativeSessionFile
  )
  assert.equal(
    createHash("sha256").update(sourceAfter).digest("hex"),
    createHash("sha256").update(sourceBefore).digest("hex")
  )
  await readFile(clientSnapshot.nativeSessionFile)
  await rm(directory, { recursive: true, force: true })
})
