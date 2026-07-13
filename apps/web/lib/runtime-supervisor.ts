import "server-only"

import { fork, type ChildProcess } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import {
  access,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises"
import path from "node:path"

import {
  promptAcceptedSchema,
  runtimeSnapshotSchema,
  workerToHostMessageSchema,
  type HostToWorkerMessage,
  type RuntimeSnapshot,
  type RuntimeStatus,
  type WorkerToHostMessage,
} from "@workspace/runtime-protocol"

import { getPiAgentDir, getPiWorkerPath, getAppPaths } from "@/lib/app-paths"
import { getSessionRuntimeTarget } from "@/lib/catalog"
import { getEventHub, type EventHub } from "@/lib/event-hub"
import { RuntimeRequestError } from "@/lib/runtime-error"

export interface RuntimeState {
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
}

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

interface ManagedRuntime {
  webSessionId: string
  runtimeProfileId: string
  nativeSessionId: string
  nativeSessionFile: string
  cwd: string
  child: ChildProcess
  lockPath: string
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
  pending: Map<string, PendingRequest>
  lastActivityAt: number
  cleaned: boolean
}

interface SessionLock {
  ownerPid: number
  webSessionId: string
  runtimeProfileId: string
  createdAt: string
}

const REQUEST_TIMEOUT_MS = 30_000
const COMPACTION_TIMEOUT_MS = 10 * 60_000
const IDLE_TIMEOUT_MS = 15 * 60_000

const DOMAIN_EVENT_TYPES: Record<string, string> = {
  agent_start: "runtime.busy",
  agent_end: "runtime.agent.end",
  agent_settled: "runtime.idle",
  turn_start: "assistant.turn.start",
  turn_end: "assistant.turn.end",
  message_start: "session.message.start",
  message_update: "session.message.update",
  message_end: "session.message.end",
  tool_execution_start: "tool.execution.start",
  tool_execution_update: "tool.execution.update",
  tool_execution_end: "tool.execution.end",
  queue_update: "queue.updated",
  compaction_start: "compaction.start",
  compaction_end: "compaction.end",
  entry_appended: "session.entry.appended",
  session_info_changed: "session.name.changed",
  thinking_level_changed: "session.thinking-level.changed",
  auto_retry_start: "retry.start",
  auto_retry_end: "retry.end",
}

declare global {
  var piWebCodexRuntimeSupervisor: RuntimeSupervisor | undefined
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true
    throw error
  }
}

function workerEnvironment() {
  const environment = { ...process.env }
  delete environment.PI_SERVER_MODE
  delete environment.PI_SERVER_URL
  delete environment.PI_SERVER_AUTH_TOKEN
  return environment
}

function requestId() {
  return randomUUID()
}

export class RuntimeSupervisor {
  private readonly runtimes = new Map<string, ManagedRuntime>()
  private readonly activations = new Map<string, Promise<ManagedRuntime>>()
  private readonly eventHub: EventHub
  private readonly idleTimer: NodeJS.Timeout

  constructor(eventHub = getEventHub()) {
    this.eventHub = eventHub
    this.idleTimer = setInterval(() => this.recycleIdleRuntimes(), 60_000)
    this.idleTimer.unref()
    process.once("exit", () => {
      clearInterval(this.idleTimer)
      for (const runtime of this.runtimes.values()) {
        runtime.child.kill("SIGTERM")
        rmSync(runtime.lockPath, { force: true })
      }
    })
  }

  state(sessionId: string): RuntimeState {
    const runtime = this.runtimes.get(sessionId)
    return runtime
      ? { status: runtime.status, snapshot: runtime.snapshot }
      : { status: "stopped", snapshot: null }
  }

  async activate(sessionId: string) {
    const current = this.runtimes.get(sessionId)
    if (current && !current.cleaned) {
      if (["starting", "ready", "busy"].includes(current.status)) return current
      throw new RuntimeRequestError(
        "RuntimeUnavailable",
        `The Pi runtime cannot accept work while it is ${current.status}.`
      )
    }

    const inFlight = this.activations.get(sessionId)
    if (inFlight) return inFlight

    const activation = this.startRuntime(sessionId).finally(() => {
      if (this.activations.get(sessionId) === activation) {
        this.activations.delete(sessionId)
      }
    })
    this.activations.set(sessionId, activation)
    return activation
  }

  async prompt(
    sessionId: string,
    input: {
      message: string
      images: { type: "image"; data: string; mimeType: string }[]
      streamingBehavior: "steer" | "followUp"
    }
  ) {
    const runtime = await this.activate(sessionId)
    runtime.lastActivityAt = Date.now()
    const operationId = randomUUID()
    const accepted = promptAcceptedSchema.parse(
      await this.request(runtime, {
        type: "session.prompt",
        requestId: requestId(),
        sessionId,
        payload: input,
      })
    )
    return { operationId, ...accepted }
  }

  async abort(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    runtime.lastActivityAt = Date.now()
    const snapshot = runtimeSnapshotSchema.parse(
      await this.request(runtime, {
        type: "session.abort",
        requestId: requestId(),
        sessionId,
      })
    )
    runtime.snapshot = snapshot
    runtime.status =
      snapshot.isStreaming || snapshot.isCompacting ? "busy" : "ready"
    if (runtime.status === "ready") {
      this.eventHub.publish({
        type: "runtime.idle",
        sessionId,
        payload: {},
      })
    }
    return snapshot
  }

  async snapshot(sessionId: string) {
    const runtime = await this.activate(sessionId)
    const data = await this.request(runtime, {
      type: "session.snapshot",
      requestId: requestId(),
      sessionId,
    })
    runtime.snapshot = runtimeSnapshotSchema.parse(data)
    return runtime.snapshot
  }

  models(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned || !runtime.snapshot) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "Activate the Pi runtime before listing its available models."
      )
    }
    return runtime.snapshot.availableModels
  }

  async setModel(sessionId: string, provider: string, modelId: string) {
    const runtime = await this.activate(sessionId)
    const snapshot = runtimeSnapshotSchema.parse(
      await this.request(runtime, {
        type: "session.set-model",
        requestId: requestId(),
        sessionId,
        payload: { provider, modelId },
      })
    )
    runtime.snapshot = snapshot
    return snapshot
  }

  async setThinkingLevel(
    sessionId: string,
    level: RuntimeSnapshot["thinkingLevel"]
  ) {
    const runtime = await this.activate(sessionId)
    const snapshot = runtimeSnapshotSchema.parse(
      await this.request(runtime, {
        type: "session.set-thinking-level",
        requestId: requestId(),
        sessionId,
        payload: { level },
      })
    )
    runtime.snapshot = snapshot
    return snapshot
  }

  async compact(sessionId: string, instructions?: string) {
    const runtime = await this.activate(sessionId)
    runtime.lastActivityAt = Date.now()
    const reconcile = async () => {
      const snapshot = await this.snapshot(sessionId)
      runtime.status =
        snapshot.isStreaming || snapshot.isCompacting ? "busy" : "ready"
      if (runtime.status === "ready") {
        this.eventHub.publish({
          type: "runtime.idle",
          sessionId,
          payload: {},
        })
      }
      return snapshot
    }

    let result: unknown
    try {
      result = await this.request(
        runtime,
        {
          type: "session.compact",
          requestId: requestId(),
          sessionId,
          payload: { instructions },
        },
        COMPACTION_TIMEOUT_MS
      )
    } catch (error) {
      await reconcile()
      throw error
    }
    const snapshot = await reconcile()
    return { result, snapshot }
  }

  async stop(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) return
    runtime.status = "stopping"
    this.eventHub.publish({
      type: "runtime.stopping",
      sessionId,
      payload: {},
    })
    try {
      await this.request(
        runtime,
        { type: "runtime.shutdown", requestId: requestId() },
        5_000
      )
      await this.waitForExit(runtime.child, 5_000)
    } catch (error) {
      if (
        runtime.child.exitCode === null &&
        runtime.child.signalCode === null
      ) {
        runtime.child.kill("SIGTERM")
        await this.waitForExit(runtime.child, 5_000)
      }
      throw error
    }
  }

  private async startRuntime(sessionId: string) {
    const target = await getSessionRuntimeTarget(sessionId)
    if (!target) {
      throw new RuntimeRequestError(
        "SessionNotFound",
        "The indexed Pi session does not exist."
      )
    }
    if (!target.cwd) {
      throw new RuntimeRequestError(
        "SessionCwdMissing",
        "The Pi session does not record a working directory."
      )
    }
    const cwdStats = await stat(target.cwd)
    if (!cwdStats.isDirectory()) {
      throw new RuntimeRequestError(
        "SessionCwdInvalid",
        `The Pi session working directory is not a directory: ${target.cwd}`
      )
    }

    const [workerPath, nativeSessionFile] = await Promise.all([
      realpath(getPiWorkerPath()),
      realpath(target.nativeSessionFile),
    ])
    await access(workerPath)
    const lockPath = await this.acquireSessionLock({
      webSessionId: sessionId,
      runtimeProfileId: target.runtimeProfileId,
      nativeSessionId: target.nativeSessionId,
      nativeSessionFile,
    })

    const child = fork(workerPath, [], {
      cwd: target.cwd,
      env: workerEnvironment(),
      execArgv: [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    })
    const managed: ManagedRuntime = {
      webSessionId: sessionId,
      runtimeProfileId: target.runtimeProfileId,
      nativeSessionId: target.nativeSessionId,
      nativeSessionFile,
      cwd: target.cwd,
      child,
      lockPath,
      status: "starting",
      snapshot: null,
      pending: new Map(),
      lastActivityAt: Date.now(),
      cleaned: false,
    }
    this.runtimes.set(sessionId, managed)
    this.bindChild(managed)
    this.eventHub.publish({
      type: "runtime.starting",
      sessionId,
      payload: {},
    })

    try {
      const snapshot = runtimeSnapshotSchema.parse(
        await this.request(managed, {
          type: "runtime.initialize",
          requestId: requestId(),
          payload: {
            webSessionId: sessionId,
            runtimeProfileId: target.runtimeProfileId,
            cwd: target.cwd,
            agentDir: getPiAgentDir(),
            nativeSessionFile,
          },
        })
      )
      if (snapshot.nativeSessionId !== target.nativeSessionId) {
        throw new RuntimeRequestError(
          "SessionIdentityMismatch",
          "The Pi worker opened a different native session."
        )
      }
      managed.snapshot = snapshot
      managed.status = "ready"
      return managed
    } catch (error) {
      managed.child.kill("SIGTERM")
      await this.cleanup(managed)
      throw error
    }
  }

  private bindChild(runtime: ManagedRuntime) {
    runtime.child.on("message", (raw: unknown) => {
      const parsed = workerToHostMessageSchema.safeParse(raw)
      if (!parsed.success) {
        this.failRuntime(
          runtime,
          new RuntimeRequestError("InvalidWorkerMessage", parsed.error.message)
        )
        return
      }
      this.handleWorkerMessage(runtime, parsed.data)
    })
    runtime.child.once("error", (error) => this.failRuntime(runtime, error))
    runtime.child.once("exit", (code, signal) => {
      const expected = runtime.status === "stopping"
      if (!expected) {
        this.eventHub.publish({
          type: "runtime.crashed",
          sessionId: runtime.webSessionId,
          payload: { code, signal },
        })
      } else {
        this.eventHub.publish({
          type: "runtime.stopped",
          sessionId: runtime.webSessionId,
          payload: {},
        })
      }
      this.rejectPending(
        runtime,
        new RuntimeRequestError(
          expected ? "RuntimeStopped" : "RuntimeCrashed",
          expected
            ? "The Pi runtime stopped."
            : `The Pi runtime exited (${signal ?? code ?? "unknown"}).`
        )
      )
      void this.cleanup(runtime)
    })

    runtime.child.stdout?.on("data", (chunk: Buffer) => {
      this.eventHub.publish({
        type: "runtime.log",
        sessionId: runtime.webSessionId,
        payload: { level: "stdout", message: chunk.toString("utf8") },
      })
    })
    runtime.child.stderr?.on("data", (chunk: Buffer) => {
      this.eventHub.publish({
        type: "runtime.log",
        sessionId: runtime.webSessionId,
        payload: { level: "stderr", message: chunk.toString("utf8") },
      })
    })
  }

  private handleWorkerMessage(
    runtime: ManagedRuntime,
    message: WorkerToHostMessage
  ) {
    runtime.lastActivityAt = Date.now()
    if (message.type === "runtime.ready") {
      runtime.snapshot = message.payload
      runtime.status = "ready"
      this.resolvePending(runtime, message.requestId, message.payload)
      this.eventHub.publish({
        type: "runtime.ready",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })
      return
    }
    if (message.type === "runtime.response") {
      if (message.success) {
        this.resolvePending(runtime, message.requestId, message.data)
      } else {
        const error = message.error ?? {
          code: "WorkerRequestFailed",
          message: "The Pi worker request failed.",
        }
        this.rejectOne(
          runtime,
          message.requestId,
          new RuntimeRequestError(error.code, error.message)
        )
      }
      return
    }
    if (message.type === "runtime.fatal") {
      this.failRuntime(
        runtime,
        new RuntimeRequestError(message.error.code, message.error.message)
      )
      return
    }
    if (message.type === "runtime.log") {
      this.eventHub.publish({
        type: "runtime.log",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })
      return
    }

    if (
      message.eventType === "agent_start" ||
      message.eventType === "compaction_start"
    ) {
      runtime.status = "busy"
    }
    if (message.eventType === "agent_settled") {
      runtime.status = "ready"
    }
    this.eventHub.publish({
      type: DOMAIN_EVENT_TYPES[message.eventType] ?? "session.event",
      sessionId: runtime.webSessionId,
      payload: message.payload,
    })
  }

  private request(
    runtime: ManagedRuntime,
    message: HostToWorkerMessage,
    timeoutMs = REQUEST_TIMEOUT_MS
  ) {
    if (!runtime.child.connected) {
      throw new RuntimeRequestError(
        "RuntimeDisconnected",
        "The Pi worker IPC channel is disconnected."
      )
    }
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        runtime.pending.delete(message.requestId)
        reject(
          new RuntimeRequestError(
            "RuntimeRequestTimeout",
            `The Pi worker did not answer ${message.type} within ${timeoutMs}ms.`
          )
        )
      }, timeoutMs)
      runtime.pending.set(message.requestId, { resolve, reject, timeout })
      runtime.child.send(message, (error) => {
        if (error) this.rejectOne(runtime, message.requestId, error)
      })
    })
  }

  private resolvePending(
    runtime: ManagedRuntime,
    requestId: string,
    data: unknown
  ) {
    const pending = runtime.pending.get(requestId)
    if (!pending) return
    clearTimeout(pending.timeout)
    runtime.pending.delete(requestId)
    pending.resolve(data)
  }

  private rejectOne(runtime: ManagedRuntime, requestId: string, error: Error) {
    const pending = runtime.pending.get(requestId)
    if (!pending) return
    clearTimeout(pending.timeout)
    runtime.pending.delete(requestId)
    pending.reject(error)
  }

  private rejectPending(runtime: ManagedRuntime, error: Error) {
    for (const [id] of runtime.pending) this.rejectOne(runtime, id, error)
  }

  private failRuntime(runtime: ManagedRuntime, error: Error) {
    if (runtime.cleaned) return
    runtime.status = "crashed"
    this.rejectPending(runtime, error)
    runtime.child.kill("SIGTERM")
  }

  private async cleanup(runtime: ManagedRuntime) {
    if (runtime.cleaned) return
    runtime.cleaned = true
    if (this.runtimes.get(runtime.webSessionId) === runtime) {
      this.runtimes.delete(runtime.webSessionId)
    }
    await rm(runtime.lockPath, { force: true })
  }

  private async acquireSessionLock(target: {
    webSessionId: string
    runtimeProfileId: string
    nativeSessionId: string
    nativeSessionFile: string
  }) {
    const directory = getAppPaths().sessionLocks
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const identity = [
      target.runtimeProfileId,
      target.nativeSessionId,
      target.nativeSessionFile,
    ].join("\0")
    const lockPath = path.join(
      directory,
      `${createHash("sha256").update(identity).digest("hex")}.lock`
    )
    const contents: SessionLock = {
      ownerPid: process.pid,
      webSessionId: target.webSessionId,
      runtimeProfileId: target.runtimeProfileId,
      createdAt: new Date().toISOString(),
    }

    try {
      const handle = await open(lockPath, "wx", 0o600)
      await handle.writeFile(`${JSON.stringify(contents)}\n`)
      await handle.close()
      return lockPath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }

    const owner = JSON.parse(await readFile(lockPath, "utf8")) as SessionLock
    if (processIsAlive(owner.ownerPid)) {
      throw new RuntimeRequestError(
        "SessionWriteLeaseConflict",
        `Pi session is already writable in Web session ${owner.webSessionId}.`
      )
    }
    await rm(lockPath)
    const handle = await open(lockPath, "wx", 0o600)
    await handle.writeFile(`${JSON.stringify(contents)}\n`)
    await handle.close()
    return lockPath
  }

  private recycleIdleRuntimes() {
    const threshold = Date.now() - IDLE_TIMEOUT_MS
    for (const runtime of this.runtimes.values()) {
      if (runtime.status !== "ready" || runtime.lastActivityAt >= threshold) {
        continue
      }
      void this.stop(runtime.webSessionId).catch((error) => {
        console.error("Could not stop idle Pi runtime:", error)
      })
    }
  }

  private waitForExit(child: ChildProcess, timeoutMs: number) {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.removeListener("exit", onExit)
        reject(
          new RuntimeRequestError(
            "RuntimeStopTimeout",
            `The Pi worker did not exit within ${timeoutMs}ms.`
          )
        )
      }, timeoutMs)
      const onExit = () => {
        clearTimeout(timeout)
        resolve()
      }
      child.once("exit", onExit)
    })
  }
}

export function getRuntimeSupervisor() {
  globalThis.piWebCodexRuntimeSupervisor ??= new RuntimeSupervisor()
  return globalThis.piWebCodexRuntimeSupervisor
}
