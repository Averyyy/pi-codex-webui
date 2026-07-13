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
  writeFile,
} from "node:fs/promises"
import path from "node:path"

import {
  promptAcceptedSchema,
  resourceCatalogSchema,
  sessionExportResultSchema,
  sessionNavigationResultSchema,
  sessionReplacementSchema,
  sessionStatsSchema,
  sessionTreeSchema,
  runtimeSnapshotSchema,
  workerToHostMessageSchema,
  type HostToWorkerMessage,
  type ExtensionUIResponse,
  type ResourceCatalog,
  type RuntimeSnapshot,
  type RuntimeStatus,
  type WorkerToHostMessage,
} from "@workspace/runtime-protocol"

import { getPiAgentDir, getPiWorkerPath, getAppPaths } from "@/lib/app-paths"
import {
  getSessionIdentityByNativeFile,
  getSessionRuntimeTarget,
} from "@/lib/catalog"
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
  pendingResourceReload: boolean
}

interface SessionLock {
  ownerPid: number
  webSessionId: string
  runtimeProfileId: string
  createdAt: string
}

type SessionReplacementMessage = Extract<
  HostToWorkerMessage,
  {
    type: "session.new" | "session.clone" | "session.fork" | "session.import"
  }
>

type ResourceRequestMessage = Extract<
  HostToWorkerMessage,
  {
    type:
      | "resources.catalog"
      | "resources.set-enabled"
      | "packages.install"
      | "packages.remove"
      | "packages.update"
      | "project.trust.set"
  }
>

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
  private resourceQueue: Promise<void> = Promise.resolve()

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

  async rename(sessionId: string, name: string) {
    const runtime = await this.activateReadyRuntime(sessionId)
    const snapshot = runtimeSnapshotSchema.parse(
      await this.request(runtime, {
        type: "session.rename",
        requestId: requestId(),
        sessionId,
        payload: { name },
      })
    )
    runtime.snapshot = snapshot
    return snapshot
  }

  async stats(sessionId: string) {
    const runtime = await this.activateReadyRuntime(sessionId)
    return sessionStatsSchema.parse(
      await this.request(runtime, {
        type: "session.stats",
        requestId: requestId(),
        sessionId,
      })
    )
  }

  async tree(sessionId: string) {
    const runtime = await this.activateReadyRuntime(sessionId)
    return sessionTreeSchema.parse(
      await this.request(runtime, {
        type: "session.tree",
        requestId: requestId(),
        sessionId,
      })
    )
  }

  async navigateTree(sessionId: string, entryId: string, summarize: boolean) {
    const runtime = await this.activateReadyRuntime(sessionId)
    const result = sessionNavigationResultSchema.parse(
      await this.request(
        runtime,
        {
          type: "session.navigate-tree",
          requestId: requestId(),
          sessionId,
          payload: { entryId, summarize },
        },
        summarize ? COMPACTION_TIMEOUT_MS : REQUEST_TIMEOUT_MS
      )
    )
    runtime.snapshot = result.snapshot
    this.eventHub.publish({
      type: "session.leaf.changed",
      sessionId,
      payload: { leafId: result.leafId, editorText: result.editorText },
    })
    return result
  }

  newSession(sessionId: string) {
    return this.replaceRuntimeSession(sessionId, (nextWebSessionId) => ({
      type: "session.new",
      requestId: requestId(),
      sessionId,
      payload: { nextWebSessionId },
    }))
  }

  clone(sessionId: string) {
    return this.replaceRuntimeSession(sessionId, (nextWebSessionId) => ({
      type: "session.clone",
      requestId: requestId(),
      sessionId,
      payload: { nextWebSessionId },
    }))
  }

  fork(sessionId: string, entryId: string, position: "before" | "at") {
    return this.replaceRuntimeSession(sessionId, (nextWebSessionId) => ({
      type: "session.fork",
      requestId: requestId(),
      sessionId,
      payload: { nextWebSessionId, entryId, position },
    }))
  }

  async importSession(sessionId: string, content: Uint8Array) {
    const temporary = getAppPaths().temporary
    await mkdir(temporary, { recursive: true, mode: 0o700 })
    const inputPath = path.join(temporary, `${randomUUID()}.jsonl`)
    await writeFile(inputPath, content, { mode: 0o600 })
    try {
      return await this.replaceRuntimeSession(
        sessionId,
        (nextWebSessionId, runtime) => ({
          type: "session.import",
          requestId: requestId(),
          sessionId,
          payload: {
            nextWebSessionId,
            inputPath,
            cwdOverride: runtime.cwd,
          },
        })
      )
    } finally {
      await rm(inputPath, { force: true })
    }
  }

  async exportSession(sessionId: string, format: "jsonl" | "html") {
    const runtime = await this.activateReadyRuntime(sessionId)
    const temporary = getAppPaths().temporary
    await mkdir(temporary, { recursive: true, mode: 0o700 })
    const outputPath = path.join(temporary, `${randomUUID()}.${format}`)
    try {
      const result = sessionExportResultSchema.parse(
        await this.request(
          runtime,
          {
            type: "session.export",
            requestId: requestId(),
            sessionId,
            payload: { format, outputPath },
          },
          COMPACTION_TIMEOUT_MS
        )
      )
      if (path.resolve(result.outputPath) !== outputPath) {
        throw new RuntimeRequestError(
          "InvalidExportPath",
          "The Pi worker returned an unexpected export path."
        )
      }
      return await readFile(outputPath)
    } finally {
      await rm(outputPath, { force: true })
    }
  }

  async respondToExtensionUI(
    sessionId: string,
    extensionRequestId: string,
    response: ExtensionUIResponse
  ) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    await this.request(runtime, {
      type: "extension.ui.response",
      requestId: requestId(),
      sessionId,
      payload: { extensionRequestId, response },
    })
  }

  async resourceCatalog(cwd: string) {
    return this.annotateResourceReload(
      cwd,
      resourceCatalogSchema.parse(
        await this.resourceRequest({
          type: "resources.catalog",
          requestId: requestId(),
          payload: { cwd, agentDir: getPiAgentDir() },
        })
      )
    )
  }

  async setResourceEnabled(
    cwd: string,
    resourceId: string,
    resourceType: "extension" | "skill" | "prompt" | "theme",
    writeScope: "global" | "project",
    enabled: boolean
  ) {
    const catalog = resourceCatalogSchema.parse(
      await this.resourceRequest({
        type: "resources.set-enabled",
        requestId: requestId(),
        payload: {
          cwd,
          agentDir: getPiAgentDir(),
          resourceId,
          resourceType,
          writeScope,
          enabled,
        },
      })
    )
    await this.reloadResources(cwd, writeScope === "global")
    return this.annotateResourceReload(cwd, catalog)
  }

  async installPackage(
    cwd: string,
    source: string,
    scope: "global" | "project"
  ) {
    const catalog = resourceCatalogSchema.parse(
      await this.resourceRequest(
        {
          type: "packages.install",
          requestId: requestId(),
          payload: { cwd, agentDir: getPiAgentDir(), source, scope },
        },
        COMPACTION_TIMEOUT_MS
      )
    )
    await this.reloadResources(cwd, scope === "global")
    return this.annotateResourceReload(cwd, catalog)
  }

  async mutatePackage(
    cwd: string,
    packageId: string,
    operation: "remove" | "update"
  ) {
    const catalog = resourceCatalogSchema.parse(
      await this.resourceRequest(
        {
          type: operation === "remove" ? "packages.remove" : "packages.update",
          requestId: requestId(),
          payload: { cwd, agentDir: getPiAgentDir(), packageId },
        },
        COMPACTION_TIMEOUT_MS
      )
    )
    await this.reloadResources(cwd, true)
    return this.annotateResourceReload(cwd, catalog)
  }

  async setProjectTrust(cwd: string, trusted: boolean) {
    const catalog = resourceCatalogSchema.parse(
      await this.resourceRequest({
        type: "project.trust.set",
        requestId: requestId(),
        payload: { cwd, agentDir: getPiAgentDir(), trusted },
      })
    )
    await this.reloadResources(cwd, false)
    return this.annotateResourceReload(cwd, catalog)
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

  private async activateReadyRuntime(sessionId: string) {
    const runtime = await this.activate(sessionId)
    if (runtime.status !== "ready") {
      throw new RuntimeRequestError(
        "RuntimeBusy",
        "Wait for the Pi runtime to become ready before changing the session."
      )
    }
    return runtime
  }

  private async replaceRuntimeSession(
    sessionId: string,
    createMessage: (
      nextWebSessionId: string,
      runtime: ManagedRuntime
    ) => SessionReplacementMessage
  ) {
    const runtime = await this.activateReadyRuntime(sessionId)
    const provisionalWebSessionId = randomUUID()
    const result = sessionReplacementSchema.parse(
      await this.request(
        runtime,
        createMessage(provisionalWebSessionId, runtime),
        COMPACTION_TIMEOUT_MS
      )
    )
    if (result.cancelled) {
      throw new RuntimeRequestError(
        "SessionOperationCancelled",
        "A Pi extension cancelled the session operation."
      )
    }

    let nextLockPath: string | null = null
    try {
      const identity = await getSessionIdentityByNativeFile(
        result.snapshot.nativeSessionFile
      )
      if (!identity) {
        throw new RuntimeRequestError(
          "SessionIndexFailed",
          "The new Pi session was not added to the session index."
        )
      }
      if (identity.nativeSessionId !== result.snapshot.nativeSessionId) {
        throw new RuntimeRequestError(
          "SessionIdentityMismatch",
          "The indexed Pi session does not match the replacement runtime."
        )
      }

      let snapshot = result.snapshot
      if (identity.id !== provisionalWebSessionId) {
        snapshot = runtimeSnapshotSchema.parse(
          await this.request(runtime, {
            type: "runtime.rebind-web-session",
            requestId: requestId(),
            payload: { webSessionId: identity.id },
          })
        )
      }

      nextLockPath = await this.acquireSessionLock({
        webSessionId: identity.id,
        runtimeProfileId: runtime.runtimeProfileId,
        nativeSessionId: identity.nativeSessionId,
        nativeSessionFile: identity.nativeSessionFile,
      })
      const previousLockPath = runtime.lockPath
      const previousWebSessionId = runtime.webSessionId
      await rm(previousLockPath, { force: true })
      this.runtimes.delete(previousWebSessionId)
      runtime.webSessionId = identity.id
      runtime.nativeSessionId = identity.nativeSessionId
      runtime.nativeSessionFile = identity.nativeSessionFile
      runtime.lockPath = nextLockPath
      runtime.snapshot = snapshot
      runtime.status = "ready"
      runtime.lastActivityAt = Date.now()
      this.runtimes.set(identity.id, runtime)

      this.eventHub.publish({
        type: "runtime.stopped",
        sessionId: previousWebSessionId,
        payload: {},
      })
      this.eventHub.publish({
        type: "runtime.ready",
        sessionId: identity.id,
        payload: snapshot,
      })
      return {
        projectId: identity.projectId,
        sessionId: identity.id,
        snapshot,
      }
    } catch (error) {
      runtime.status = "stopping"
      runtime.child.kill("SIGTERM")
      await this.cleanup(runtime)
      if (nextLockPath) await rm(nextLockPath, { force: true })
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
      pendingResourceReload: false,
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
    if (message.type === "extension.ui.request") {
      this.eventHub.publish({
        type: "extension.ui.request",
        sessionId: runtime.webSessionId,
        payload: { requestId: message.requestId, ...message.payload },
      })
      return
    }
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
      if (runtime.pendingResourceReload) {
        void this.reloadRuntimeResources(runtime).catch((error: Error) =>
          this.failRuntime(runtime, error)
        )
      }
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

  private resourceRequest(
    message: ResourceRequestMessage,
    timeoutMs = REQUEST_TIMEOUT_MS
  ) {
    const operation = this.resourceQueue.then(() =>
      this.performResourceRequest(message, timeoutMs)
    )
    this.resourceQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private async performResourceRequest(
    message: ResourceRequestMessage,
    timeoutMs: number
  ) {
    const workerPath = await realpath(getPiWorkerPath())
    await access(workerPath)
    const child = fork(workerPath, [], {
      cwd: message.payload.cwd,
      env: workerEnvironment(),
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    })
    return new Promise<unknown>((resolve, reject) => {
      let settled = false
      const finish = (complete: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        child.removeAllListeners()
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM")
        }
        complete()
      }
      const timeout = setTimeout(
        () =>
          finish(() =>
            reject(
              new RuntimeRequestError(
                "ResourceRequestTimeout",
                `The Pi resource worker did not answer within ${timeoutMs}ms.`
              )
            )
          ),
        timeoutMs
      )
      child.once("error", (error) => finish(() => reject(error)))
      child.once("exit", (code, signal) =>
        finish(() =>
          reject(
            new RuntimeRequestError(
              "ResourceWorkerExited",
              `The Pi resource worker exited (${signal ?? code ?? "unknown"}).`
            )
          )
        )
      )
      child.on("message", (raw: unknown) => {
        const parsed = workerToHostMessageSchema.safeParse(raw)
        if (!parsed.success) {
          finish(() =>
            reject(
              new RuntimeRequestError(
                "InvalidWorkerMessage",
                parsed.error.message
              )
            )
          )
          return
        }
        const response = parsed.data
        if (
          response.type !== "runtime.response" ||
          response.requestId !== message.requestId
        ) {
          return
        }
        if (response.success) finish(() => resolve(response.data))
        else {
          finish(() =>
            reject(
              new RuntimeRequestError(
                response.error?.code ?? "ResourceRequestFailed",
                response.error?.message ?? "The Pi resource request failed."
              )
            )
          )
        }
      })
      child.send(message, (error) => {
        if (error) finish(() => reject(error))
      })
    })
  }

  private async reloadResources(cwd: string, global: boolean) {
    const reloads: Promise<RuntimeSnapshot>[] = []
    for (const runtime of this.runtimes.values()) {
      if (!global && path.resolve(runtime.cwd) !== path.resolve(cwd)) continue
      if (runtime.status === "ready") {
        reloads.push(this.reloadRuntimeResources(runtime))
      } else if (runtime.status === "busy" || runtime.status === "starting") {
        runtime.pendingResourceReload = true
      }
    }
    await Promise.all(reloads)
  }

  private async reloadRuntimeResources(runtime: ManagedRuntime) {
    runtime.pendingResourceReload = true
    runtime.status = "starting"
    this.eventHub.publish({
      type: "runtime.starting",
      sessionId: runtime.webSessionId,
      payload: { reason: "resources-reload" },
    })
    const snapshot = runtimeSnapshotSchema.parse(
      await this.request(
        runtime,
        {
          type: "runtime.reload-resources",
          requestId: requestId(),
          sessionId: runtime.webSessionId,
        },
        COMPACTION_TIMEOUT_MS
      )
    )
    runtime.snapshot = snapshot
    runtime.status = "ready"
    runtime.pendingResourceReload = false
    this.eventHub.publish({
      type: "runtime.ready",
      sessionId: runtime.webSessionId,
      payload: snapshot,
    })
    return snapshot
  }

  private annotateResourceReload(cwd: string, catalog: ResourceCatalog) {
    const pending = [...this.runtimes.values()].some(
      (runtime) =>
        !runtime.cleaned &&
        runtime.pendingResourceReload &&
        path.resolve(runtime.cwd) === path.resolve(cwd)
    )
    return pending
      ? {
          ...catalog,
          resources: catalog.resources.map((resource) => ({
            ...resource,
            reloadRequired: true,
          })),
        }
      : catalog
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
