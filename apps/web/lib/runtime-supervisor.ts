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
  modelSettingsSchema,
  promptAcceptedSchema,
  queueStateSchema,
  queueUpdatedEventSchema,
  resourceCatalogSchema,
  sessionExportResultSchema,
  sessionNavigationResultSchema,
  sessionReplacementSchema,
  sessionStatsSchema,
  sessionTreeSchema,
  subagentsSnapshotSchema,
  tuiSurfaceSnapshotsSchema,
  webUiViewSnapshotsSchema,
  runtimeSnapshotSchema,
  workerToHostMessageSchema,
  type HostToWorkerMessage,
  type ExtensionUIResponse,
  type ResourceCatalog,
  type RuntimeSnapshot,
  type RuntimeStatus,
  type SubagentsSnapshot,
  type ModelSettingsProviderInput,
  type QueuedPromptItem,
  type WebUiExtensionStatus,
  type WorkerToHostMessage,
} from "@workspace/runtime-protocol"

import {
  getAppPaths,
  getPiAgentDir,
  getPiClientWorkerPath,
  getPiWorkerPath,
} from "@/lib/app-paths"
import {
  archiveSession as archiveStoredSession,
  bindSessionRuntime,
  deleteArchivedSession as deleteStoredArchivedSession,
  getSessionIdentityByNativeFile,
  getSessionRuntimeTarget,
  markSessionCompleted as markStoredSessionCompleted,
  markSessionStandalone,
} from "@/lib/catalog"
import { getEventHub, type EventHub } from "@/lib/event-hub"
import { getMcpService } from "@/lib/mcp-service"
import type { PromptImage } from "@/lib/prompt-images"
import type {
  RuntimeCrash,
  RuntimeDiagnostics,
} from "@/lib/runtime-diagnostics"
import { RuntimeRequestError } from "@/lib/runtime-error"
import {
  resolveNewSessionRuntime,
  resolveNewTaskRuntime,
  runtimeWorkerCredentials,
} from "@/lib/runtime-profiles"
import { webUiAdaptersForRuntime } from "@/lib/webui-extensions/registry"

export interface RuntimeState {
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
}

export function hasAvailableSelectedModel(
  snapshot: Pick<RuntimeSnapshot, "model" | "availableModels"> | null
) {
  const selected = snapshot?.model
  if (!selected) return false
  return snapshot.availableModels.some(
    (model) => model.provider === selected.provider && model.id === selected.id
  )
}

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

interface ManagedRuntime {
  webSessionId: string
  projectId: string | null
  runtimeKind: "pi" | "pi-client"
  runtimeProfileId: string
  nativeSessionId: string
  nativeSessionFile: string
  cwd: string
  child: ChildProcess
  workerPath: string
  lockPath: string | null
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
  pending: Map<string, PendingRequest>
  lastActivityAt: number
  startedAt: number
  failureMessage: string | null
  cleaned: boolean
  pendingResourceReload: boolean
  pendingModelReload: boolean
  pendingMcpRestart: boolean
  pendingWebUiRestart: boolean
  webUiRestartPromise: Promise<void> | null
  projectTrusted: boolean
  mcpServerIds: Set<string>
  mcpCalls: Map<string, AbortController>
  cleanupPromise: Promise<void> | null
  webUiStatuses: Map<string, WebUiExtensionStatus>
}

interface NewRuntimeOptions {
  runtimeProfileId?: string
  initialMessage?: string
  initialImages?: PromptImage[]
  model?: { provider: string; modelId: string }
  thinkingLevel?: RuntimeSnapshot["thinkingLevel"]
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

type RuntimeInitializeTarget = Extract<
  HostToWorkerMessage,
  { type: "runtime.initialize" }
>["payload"]["target"]

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
      | "models.catalog"
      | "models.set-scope"
      | "providers.remove"
      | "providers.save"
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
  subagents_updated: "subagents.updated",
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

type WorkerCredentials = Awaited<ReturnType<typeof runtimeWorkerCredentials>>

function workerEnvironment(
  credentials: WorkerCredentials = { kind: "pi" },
  agentDir = getPiAgentDir()
) {
  const environment = { ...process.env }
  environment.PI_CODING_AGENT_DIR = agentDir
  delete environment.PI_SERVER_MODE
  delete environment.PI_SERVER_URL
  delete environment.PI_SERVER_AUTH_TOKEN
  if (credentials.kind === "pi-client") {
    environment.PI_SERVER_MODE = "true"
    environment.PI_SERVER_URL = credentials.serverUrl
    if (credentials.authToken) {
      environment.PI_SERVER_AUTH_TOKEN = credentials.authToken
    }
  }
  return environment
}

function requestId() {
  return randomUUID()
}

export class RuntimeSupervisor {
  private readonly runtimes = new Map<string, ManagedRuntime>()
  private readonly activations = new Map<string, Promise<ManagedRuntime>>()
  private readonly failures = new Map<string, RuntimeCrash>()
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
        if (runtime.lockPath) rmSync(runtime.lockPath, { force: true })
      }
    })
  }

  state(sessionId: string): RuntimeState {
    const runtime = this.runtimes.get(sessionId)
    if (runtime) return { status: runtime.status, snapshot: runtime.snapshot }
    return {
      status: this.failures.has(sessionId) ? "crashed" : "stopped",
      snapshot: null,
    }
  }

  diagnostics(sessionId: string): RuntimeDiagnostics {
    const runtime = this.runtimes.get(sessionId)
    const crash = this.failures.get(sessionId) ?? null
    return {
      status: runtime?.status ?? (crash ? "crashed" : "stopped"),
      active: Boolean(runtime && !runtime.cleaned),
      pid: runtime?.child.pid ?? null,
      runtimeKind: runtime?.runtimeKind ?? null,
      runtimeProfileId: runtime?.runtimeProfileId ?? null,
      cwd: runtime?.cwd ?? null,
      workerPath: runtime?.workerPath ?? null,
      startedAt: runtime ? new Date(runtime.startedAt).toISOString() : null,
      lastActivityAt: runtime
        ? new Date(runtime.lastActivityAt).toISOString()
        : null,
      pendingRequests: runtime?.pending.size ?? 0,
      activeMcpCalls: runtime?.mcpCalls.size ?? 0,
      mcpServers: runtime ? [...runtime.mcpServerIds].sort() : [],
      activeTools: runtime?.snapshot?.activeTools ?? [],
      crash,
      events: this.eventHub.recent(sessionId),
    }
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
    if (!hasAvailableSelectedModel(runtime.snapshot)) {
      throw new RuntimeRequestError(
        "ModelUnavailable",
        "The selected model is unavailable. Configure its Provider credentials or choose an available model."
      )
    }
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

  async replacePromptQueue(
    sessionId: string,
    expected: QueuedPromptItem[],
    next: QueuedPromptItem[]
  ) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    runtime.lastActivityAt = Date.now()
    return queueStateSchema.parse(
      await this.request(runtime, {
        type: "session.queue.replace",
        requestId: requestId(),
        sessionId,
        payload: { expected, next },
      })
    )
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

  async navigateTree(
    sessionId: string,
    entryId: string,
    summarize: boolean,
    options: { restoreEditor?: boolean; publishEvent?: boolean } = {}
  ) {
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
    if (options.publishEvent !== false) {
      this.eventHub.publish({
        type: "session.leaf.changed",
        sessionId,
        payload: {
          leafId: result.leafId,
          ...(options.restoreEditor !== false && result.editorText !== undefined
            ? { editorText: result.editorText }
            : {}),
        },
      })
    }
    return result
  }

  async editMessage(
    sessionId: string,
    entryId: string,
    input: {
      message: string
      images: { type: "image"; data: string; mimeType: string }[]
      streamingBehavior: "steer" | "followUp"
    }
  ) {
    const runtime = await this.activateReadyRuntime(sessionId)
    if (!hasAvailableSelectedModel(runtime.snapshot)) {
      throw new RuntimeRequestError(
        "ModelUnavailable",
        "The selected model is unavailable. Configure its Provider credentials or choose an available model."
      )
    }
    const navigation = await this.navigateTree(sessionId, entryId, false, {
      restoreEditor: false,
      publishEvent: false,
    })
    if (navigation.cancelled) {
      throw new RuntimeRequestError(
        "NavigationCancelled",
        "Message editing was cancelled by the Pi runtime."
      )
    }
    return this.prompt(sessionId, input)
  }

  async createSession(projectId: string, options: NewRuntimeOptions = {}) {
    const target = await resolveNewSessionRuntime(
      projectId,
      options.runtimeProfileId
    )
    return this.configureNewRuntime(
      await this.launchUnboundRuntime(target, { mode: "new" }, null),
      options
    )
  }

  async createTask(options: NewRuntimeOptions = {}) {
    const target = await resolveNewTaskRuntime(options.runtimeProfileId)
    return this.configureNewRuntime(
      await this.launchUnboundRuntime(target, { mode: "new" }, null),
      options
    )
  }

  private async configureNewRuntime<
    T extends { sessionId: string; snapshot: RuntimeSnapshot },
  >(created: T, options: NewRuntimeOptions) {
    let snapshot = created.snapshot
    try {
      if (options.model) {
        snapshot = await this.setModel(
          created.sessionId,
          options.model.provider,
          options.model.modelId
        )
      }
      if (options.thinkingLevel) {
        snapshot = await this.setThinkingLevel(
          created.sessionId,
          options.thinkingLevel
        )
      }
      if (options.initialMessage) {
        await this.prompt(created.sessionId, {
          message: options.initialMessage,
          images: options.initialImages ?? [],
          streamingBehavior: "followUp",
        })
      }
      return { ...created, snapshot }
    } catch (error) {
      await this.archiveSession(created.sessionId)
      await this.deleteArchivedSession(created.sessionId)
      throw error
    }
  }

  async duplicateIntoRuntime(sessionId: string, runtimeProfileId: string) {
    const source = await getSessionRuntimeTarget(sessionId)
    if (!source) {
      throw new RuntimeRequestError("SessionNotFound", "Session not found.")
    }
    const target =
      source.projectId === null
        ? await resolveNewTaskRuntime(runtimeProfileId)
        : await resolveNewSessionRuntime(source.projectId, runtimeProfileId)
    return this.launchUnboundRuntime(
      target,
      {
        mode: "duplicate",
        sourceSessionFile: await realpath(source.nativeSessionFile),
      },
      sessionId
    )
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

  async tuiSurfaces(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) return []
    return tuiSurfaceSnapshotsSchema.parse(
      await this.request(runtime, {
        type: "tui.surface.list",
        requestId: requestId(),
        sessionId,
      })
    )
  }

  async webUiViews(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) return []
    return webUiViewSnapshotsSchema.parse(
      await this.request(runtime, {
        type: "webui.view.list",
        requestId: requestId(),
        sessionId,
      })
    )
  }

  async subagents(sessionId: string): Promise<SubagentsSnapshot> {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      return { version: 1, revision: 0, available: false, agents: [] }
    }
    return subagentsSnapshotSchema.parse(
      await this.request(runtime, {
        type: "subagents.snapshot",
        requestId: requestId(),
        sessionId,
      })
    )
  }

  async stopSubagent(sessionId: string, agentId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    runtime.lastActivityAt = Date.now()
    await this.request(runtime, {
      type: "subagents.stop",
      requestId: requestId(),
      sessionId,
      payload: { agentId },
    })
  }

  async invokeWebUiAction(
    sessionId: string,
    extensionId: string,
    instanceId: string,
    actionId: string,
    input?: unknown
  ) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    runtime.lastActivityAt = Date.now()
    return this.request(runtime, {
      type: "webui.action.invoke",
      requestId: requestId(),
      sessionId,
      payload: { extensionId, instanceId, actionId, input },
    })
  }

  async reportWebUiClientStatus(
    sessionId: string,
    extensionId: string,
    instanceId: string,
    status: "ready" | "error" | "disposed",
    message?: string
  ) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      if (status === "disposed") return
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    await this.request(runtime, {
      type: "webui.client.status",
      requestId: requestId(),
      sessionId,
      payload: { extensionId, instanceId, status, message },
    })
  }

  webUiExtensionStatuses(sessionIds: string[]) {
    return sessionIds.flatMap((sessionId) => {
      const runtime = this.runtimes.get(sessionId)
      return runtime
        ? [...runtime.webUiStatuses.values()].map((status) => ({
            sessionId,
            ...status,
          }))
        : []
    })
  }

  refreshWebUiExtensions() {
    for (const runtime of [...this.runtimes.values()]) {
      if (runtime.status === "ready") {
        this.scheduleWebUiRestart(runtime)
      } else if (runtime.status === "busy" || runtime.status === "starting") {
        runtime.pendingWebUiRestart = true
      }
    }
  }

  async actOnTuiSurface(
    sessionId: string,
    surfaceId: string,
    action: Extract<
      HostToWorkerMessage,
      { type: "tui.surface.action" }
    >["payload"]["action"]
  ) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    runtime.lastActivityAt = Date.now()
    await this.request(runtime, {
      type: "tui.surface.action",
      requestId: requestId(),
      sessionId,
      payload: { surfaceId, action },
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

  async modelSettings(cwd: string) {
    return modelSettingsSchema.parse(
      await this.resourceRequest({
        type: "models.catalog",
        requestId: requestId(),
        payload: { cwd, agentDir: getPiAgentDir() },
      })
    )
  }

  async setModelScope(cwd: string, enabledModelIds: string[] | null) {
    const settings = modelSettingsSchema.parse(
      await this.resourceRequest({
        type: "models.set-scope",
        requestId: requestId(),
        payload: {
          cwd,
          agentDir: getPiAgentDir(),
          enabledModelIds,
        },
      })
    )
    await this.reloadModelSettings()
    return settings
  }

  async removeProvider(cwd: string, provider: string) {
    const settings = modelSettingsSchema.parse(
      await this.resourceRequest({
        type: "providers.remove",
        requestId: requestId(),
        payload: { cwd, agentDir: getPiAgentDir(), provider },
      })
    )
    await this.reloadModelSettings()
    return settings
  }

  async saveCustomProvider(cwd: string, input: ModelSettingsProviderInput) {
    const settings = modelSettingsSchema.parse(
      await this.resourceRequest({
        type: "providers.save",
        requestId: requestId(),
        payload: { cwd, agentDir: getPiAgentDir(), ...input },
      })
    )
    await this.reloadModelSettings()
    return settings
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

  async setProjectTrust(projectId: string, cwd: string, trusted: boolean) {
    const catalog = resourceCatalogSchema.parse(
      await this.resourceRequest({
        type: "project.trust.set",
        requestId: requestId(),
        payload: { cwd, agentDir: getPiAgentDir(), trusted },
      })
    )
    await this.reloadResources(cwd, false)
    await getMcpService().catalog({
      projectId,
      projectPath: cwd,
      projectTrusted: trusted,
    })
    await this.reloadMcpRuntimes(cwd, false)
    return this.annotateResourceReload(cwd, catalog)
  }

  async mcpConfigurationChanged(
    serverId: string,
    cwd: string | null,
    global: boolean
  ) {
    await getMcpService().configurationChanged(serverId)
    await this.reloadMcpRuntimes(cwd, global)
    this.eventHub.publish({
      type: "mcp.status",
      payload: { serverId, reason: "configuration-changed" },
    })
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

  async archiveSession(sessionId: string) {
    await this.stop(sessionId)
    const archivedAt = await archiveStoredSession(sessionId)
    if (!archivedAt) {
      throw new RuntimeRequestError("SessionNotFound", "Session not found.")
    }
    return { sessionId, archivedAt }
  }

  async deleteArchivedSession(sessionId: string) {
    await this.stop(sessionId)
    if (!(await deleteStoredArchivedSession(sessionId))) {
      throw new RuntimeRequestError(
        "SessionNotFound",
        "Archived session not found."
      )
    }
    return { sessionId }
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
      if (runtime.projectId === null) {
        await markSessionStandalone(identity.id, {
          cwd: runtime.cwd,
          runtimeKind: runtime.runtimeKind,
          runtimeProfileId: runtime.runtimeProfileId,
        })
      } else {
        if (identity.projectId !== runtime.projectId) {
          throw new RuntimeRequestError(
            "SessionProjectMismatch",
            "The replacement session belongs to a different project."
          )
        }
        await bindSessionRuntime(
          identity.id,
          runtime.runtimeKind,
          runtime.runtimeProfileId
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
      if (!previousLockPath) {
        throw new Error("Active runtime is missing its session lock.")
      }
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
        projectId: runtime.projectId,
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

  private async launchUnboundRuntime(
    target: {
      projectId: string | null
      cwd: string
      profileId: string
      runtimeKind: "pi" | "pi-client"
    },
    initializationTarget: RuntimeInitializeTarget,
    migratedFromSessionId: string | null
  ) {
    if (!target.cwd) {
      throw new RuntimeRequestError(
        "SessionCwdMissing",
        "The project does not record a working directory."
      )
    }
    const cwdStats = await stat(target.cwd)
    if (!cwdStats.isDirectory()) {
      throw new RuntimeRequestError(
        "SessionCwdInvalid",
        `The project working directory is not a directory: ${target.cwd}`
      )
    }

    const credentials = await runtimeWorkerCredentials(target.profileId)
    if (credentials.kind !== target.runtimeKind) {
      throw new RuntimeRequestError(
        "RuntimeProfileMismatch",
        `Runtime profile ${target.profileId} changed while creating the session.`
      )
    }
    const workerPath = await realpath(
      credentials.kind === "pi-client"
        ? getPiClientWorkerPath()
        : getPiWorkerPath()
    )
    await access(workerPath)
    const mcpContext = await this.mcpContext(target.projectId, target.cwd)
    const [mcpTools, webuiAdapters] = await Promise.all([
      getMcpService().toolDefinitions(mcpContext),
      webUiAdaptersForRuntime(
        target.runtimeKind,
        target.projectId === null
          ? { projectId: null, projectTrusted: false }
          : {
              cwd: target.cwd,
              projectId: target.projectId,
              projectTrusted: mcpContext.projectTrusted,
            }
      ),
    ])

    const provisionalWebSessionId = randomUUID()
    const child = fork(workerPath, [], {
      cwd: target.cwd,
      env: workerEnvironment(credentials),
      execArgv: [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    })
    const managed: ManagedRuntime = {
      webSessionId: provisionalWebSessionId,
      projectId: target.projectId,
      runtimeKind: target.runtimeKind,
      runtimeProfileId: target.profileId,
      nativeSessionId: "",
      nativeSessionFile: "",
      cwd: target.cwd,
      child,
      workerPath,
      lockPath: null,
      status: "starting",
      snapshot: null,
      pending: new Map(),
      lastActivityAt: Date.now(),
      startedAt: Date.now(),
      failureMessage: null,
      cleaned: false,
      pendingResourceReload: false,
      pendingModelReload: false,
      pendingMcpRestart: false,
      pendingWebUiRestart: false,
      webUiRestartPromise: null,
      projectTrusted: mcpContext.projectTrusted,
      mcpServerIds: new Set(mcpTools.map((tool) => tool.serverId)),
      mcpCalls: new Map(),
      cleanupPromise: null,
      webUiStatuses: new Map(),
    }
    this.runtimes.set(provisionalWebSessionId, managed)
    this.bindChild(managed)
    this.eventHub.publish({
      type: "runtime.starting",
      sessionId: provisionalWebSessionId,
      payload: {},
    })

    try {
      let snapshot = runtimeSnapshotSchema.parse(
        await this.request(managed, {
          type: "runtime.initialize",
          requestId: requestId(),
          payload: {
            webSessionId: provisionalWebSessionId,
            runtimeProfileId: target.profileId,
            cwd: target.cwd,
            agentDir: getPiAgentDir(),
            mcpTools,
            webuiAdapters,
            target: initializationTarget,
          },
        })
      )
      const identity = await getSessionIdentityByNativeFile(
        snapshot.nativeSessionFile
      )
      if (!identity || identity.nativeSessionId !== snapshot.nativeSessionId) {
        throw new RuntimeRequestError(
          "SessionIndexFailed",
          "The new runtime session was not indexed with the expected identity."
        )
      }
      if (target.projectId === null) {
        await markSessionStandalone(identity.id, {
          cwd: target.cwd,
          runtimeKind: target.runtimeKind,
          runtimeProfileId: target.profileId,
          migratedFromSessionId,
        })
      } else {
        if (identity.projectId !== target.projectId) {
          throw new RuntimeRequestError(
            "SessionProjectMismatch",
            "The new runtime session belongs to a different project."
          )
        }
        await bindSessionRuntime(
          identity.id,
          target.runtimeKind,
          target.profileId,
          migratedFromSessionId
        )
      }

      if (identity.id !== provisionalWebSessionId) {
        snapshot = runtimeSnapshotSchema.parse(
          await this.request(managed, {
            type: "runtime.rebind-web-session",
            requestId: requestId(),
            payload: { webSessionId: identity.id },
          })
        )
      }
      managed.lockPath = await this.acquireSessionLock({
        webSessionId: identity.id,
        runtimeProfileId: target.profileId,
        nativeSessionId: identity.nativeSessionId,
        nativeSessionFile: identity.nativeSessionFile,
      })
      this.runtimes.delete(provisionalWebSessionId)
      managed.webSessionId = identity.id
      managed.nativeSessionId = identity.nativeSessionId
      managed.nativeSessionFile = identity.nativeSessionFile
      managed.snapshot = snapshot
      managed.status = "ready"
      this.runtimes.set(identity.id, managed)
      this.eventHub.publish({
        type: "runtime.ready",
        sessionId: identity.id,
        payload: snapshot,
      })
      return {
        projectId: target.projectId,
        sessionId: identity.id,
        snapshot,
      }
    } catch (error) {
      managed.status = "stopping"
      managed.child.kill("SIGTERM")
      await this.cleanup(managed)
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

    const credentials = await runtimeWorkerCredentials(target.runtimeProfileId)
    if (credentials.kind !== target.runtimeKind) {
      throw new RuntimeRequestError(
        "RuntimeProfileMismatch",
        `Session runtime binding does not match profile ${target.runtimeProfileId}.`
      )
    }
    const [workerPath, nativeSessionFile] = await Promise.all([
      realpath(
        credentials.kind === "pi-client"
          ? getPiClientWorkerPath()
          : getPiWorkerPath()
      ),
      realpath(target.nativeSessionFile),
    ])
    await access(workerPath)
    const mcpContext = await this.mcpContext(target.projectId, target.cwd)
    const [mcpTools, webuiAdapters] = await Promise.all([
      getMcpService().toolDefinitions(mcpContext),
      webUiAdaptersForRuntime(
        target.runtimeKind,
        target.projectId === null
          ? { projectId: null, projectTrusted: false }
          : {
              cwd: target.cwd,
              projectId: target.projectId,
              projectTrusted: mcpContext.projectTrusted,
            }
      ),
    ])
    const lockPath = await this.acquireSessionLock({
      webSessionId: sessionId,
      runtimeProfileId: target.runtimeProfileId,
      nativeSessionId: target.nativeSessionId,
      nativeSessionFile,
    })

    const child = fork(workerPath, [], {
      cwd: target.cwd,
      env: workerEnvironment(credentials),
      execArgv: [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    })
    const managed: ManagedRuntime = {
      webSessionId: sessionId,
      projectId: target.projectId,
      runtimeKind: target.runtimeKind,
      runtimeProfileId: target.runtimeProfileId,
      nativeSessionId: target.nativeSessionId,
      nativeSessionFile,
      cwd: target.cwd,
      child,
      workerPath,
      lockPath,
      status: "starting",
      snapshot: null,
      pending: new Map(),
      lastActivityAt: Date.now(),
      startedAt: Date.now(),
      failureMessage: null,
      cleaned: false,
      pendingResourceReload: false,
      pendingModelReload: false,
      pendingMcpRestart: false,
      pendingWebUiRestart: false,
      webUiRestartPromise: null,
      projectTrusted: mcpContext.projectTrusted,
      mcpServerIds: new Set(mcpTools.map((tool) => tool.serverId)),
      mcpCalls: new Map(),
      cleanupPromise: null,
      webUiStatuses: new Map(),
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
            mcpTools,
            webuiAdapters,
            target: { mode: "resume", nativeSessionFile },
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
        const crash: RuntimeCrash = {
          at: new Date().toISOString(),
          code,
          signal,
          message:
            runtime.failureMessage ??
            `The Pi runtime exited (${signal ?? code ?? "unknown"}).`,
        }
        this.failures.set(runtime.webSessionId, crash)
        this.eventHub.publish({
          type: "runtime.crashed",
          sessionId: runtime.webSessionId,
          payload: crash,
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
    if (message.type === "mcp.call.request") {
      void this.handleMcpCallRequest(runtime, message)
      return
    }
    if (message.type === "mcp.call.cancel") {
      runtime.mcpCalls.get(message.requestId)?.abort()
      return
    }
    if (message.type === "extension.ui.request") {
      this.eventHub.publish({
        type: "extension.ui.request",
        sessionId: runtime.webSessionId,
        payload: { requestId: message.requestId, ...message.payload },
      })
      return
    }
    if (message.type === "tui.surface.event") {
      this.eventHub.publish({
        type: "tui.surface",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })
      return
    }
    if (message.type === "webui.view.event") {
      this.eventHub.publish({
        type: "webui.view",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })
      return
    }
    if (message.type === "webui.extension.status") {
      runtime.webUiStatuses.set(message.payload.extensionId, message.payload)
      this.eventHub.publish({
        type: "webui.extension.status",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })
      return
    }
    if (message.type === "runtime.ready") {
      this.failures.delete(runtime.webSessionId)
      runtime.snapshot = message.payload
      runtime.status = "ready"
      this.resolvePending(runtime, message.requestId, message.payload)
      this.eventHub.publish({
        type: "runtime.ready",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })
      if (runtime.pendingWebUiRestart) {
        setImmediate(() => this.scheduleWebUiRestart(runtime))
      } else if (runtime.pendingMcpRestart) {
        setImmediate(() => this.scheduleMcpRestart(runtime))
      } else if (runtime.pendingModelReload) {
        setImmediate(() => this.scheduleModelSettingsReload(runtime))
      }
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
    if (message.eventType === "queue_update" && runtime.snapshot) {
      runtime.snapshot = {
        ...runtime.snapshot,
        queuedPrompts: queueUpdatedEventSchema.parse(message.payload).items,
      }
    }
    const publishDomainEvent = () =>
      this.eventHub.publish({
        type: DOMAIN_EVENT_TYPES[message.eventType] ?? "session.event",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })

    if (message.eventType === "agent_settled") {
      void markStoredSessionCompleted(runtime.webSessionId)
        .then((updated) => {
          if (!updated) {
            throw new RuntimeRequestError(
              "SessionNotFound",
              `Cannot mark missing Web session ${runtime.webSessionId} completed.`
            )
          }
          publishDomainEvent()
          this.eventHub.publish({
            type: "session.completed",
            sessionId: runtime.webSessionId,
            payload: {},
          })
          if (runtime.pendingWebUiRestart) {
            runtime.pendingResourceReload = false
            runtime.pendingModelReload = false
            this.scheduleWebUiRestart(runtime)
          } else if (runtime.pendingMcpRestart) {
            runtime.pendingResourceReload = false
            runtime.pendingModelReload = false
            this.scheduleMcpRestart(runtime)
          } else if (runtime.pendingModelReload) {
            this.scheduleModelSettingsReload(runtime)
          } else if (runtime.pendingResourceReload) {
            void this.reloadRuntimeResources(runtime).catch((error: Error) =>
              this.failRuntime(runtime, error)
            )
          }
        })
        .catch((error: unknown) =>
          this.failRuntime(
            runtime,
            error instanceof Error ? error : new Error(String(error))
          )
        )
      return
    }

    publishDomainEvent()
  }

  private async handleMcpCallRequest(
    runtime: ManagedRuntime,
    message: Extract<WorkerToHostMessage, { type: "mcp.call.request" }>
  ) {
    const sendFailure = (code: string, detail: string) => {
      if (!runtime.child.connected) return
      runtime.child.send({
        type: "mcp.call.response",
        requestId: message.requestId,
        success: false,
        error: { code, message: detail },
      } satisfies HostToWorkerMessage)
    }
    if (message.sessionId !== runtime.webSessionId) {
      sendFailure("McpSessionMismatch", "MCP call came from the wrong session.")
      return
    }
    if (!runtime.mcpServerIds.has(message.payload.serverId)) {
      sendFailure(
        "McpServerUnavailable",
        `MCP server ${message.payload.serverId} is not available to this runtime.`
      )
      return
    }
    if (runtime.mcpCalls.has(message.requestId)) {
      sendFailure("DuplicateMcpCall", "Duplicate MCP call request ID.")
      return
    }

    const controller = new AbortController()
    runtime.mcpCalls.set(message.requestId, controller)
    try {
      const result = await getMcpService().callTool(
        message.payload.serverId,
        message.payload.toolName,
        message.payload.arguments,
        {
          projectId: runtime.projectId,
          projectPath: runtime.projectId === null ? null : runtime.cwd,
          projectTrusted: runtime.projectTrusted,
          signal: controller.signal,
        }
      )
      if (runtime.child.connected) {
        runtime.child.send({
          type: "mcp.call.response",
          requestId: message.requestId,
          success: true,
          result,
        } satisfies HostToWorkerMessage)
      }
    } catch (error) {
      sendFailure(
        error instanceof Error ? error.name : "McpCallFailed",
        error instanceof Error ? error.message : String(error)
      )
    } finally {
      runtime.mcpCalls.delete(message.requestId)
    }
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

  private async mcpContext(projectId: string | null, cwd: string) {
    if (projectId === null) {
      return {
        projectId: null,
        projectPath: null,
        projectTrusted: false,
      }
    }
    const catalog = await this.resourceCatalog(cwd)
    return {
      projectId,
      projectPath: cwd,
      projectTrusted: catalog.projectTrusted,
    }
  }

  private async reloadMcpRuntimes(cwd: string | null, global: boolean) {
    const restarts: Promise<void>[] = []
    for (const runtime of [...this.runtimes.values()]) {
      if (
        !global &&
        (!cwd || path.resolve(runtime.cwd) !== path.resolve(cwd))
      ) {
        continue
      }
      if (runtime.status === "ready") {
        restarts.push(this.restartMcpRuntime(runtime))
      } else if (runtime.status === "busy" || runtime.status === "starting") {
        runtime.pendingMcpRestart = true
      }
    }
    await Promise.all(restarts)
  }

  private scheduleMcpRestart(runtime: ManagedRuntime) {
    void this.restartMcpRuntime(runtime).catch((error: unknown) => {
      this.eventHub.publish({
        type: "mcp.reload.failed",
        sessionId: runtime.webSessionId,
        payload: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    })
  }

  private scheduleWebUiRestart(runtime: ManagedRuntime) {
    if (runtime.webUiRestartPromise) return
    runtime.webUiRestartPromise = this.restartWebUiRuntime(runtime)
      .catch((error: unknown) => {
        this.eventHub.publish({
          type: "webui.reload.failed",
          sessionId: runtime.webSessionId,
          payload: {
            message: error instanceof Error ? error.message : String(error),
          },
        })
      })
      .finally(() => {
        runtime.webUiRestartPromise = null
      })
  }

  private async restartWebUiRuntime(runtime: ManagedRuntime) {
    if (runtime.cleaned) return
    const sessionId = runtime.webSessionId
    runtime.pendingWebUiRestart = false
    runtime.pendingMcpRestart = false
    runtime.pendingResourceReload = false
    runtime.pendingModelReload = false
    this.eventHub.publish({
      type: "webui.reload.started",
      sessionId,
      payload: {},
    })
    await this.stop(sessionId)
    await this.cleanup(runtime)
    await this.activate(sessionId)
  }

  private async restartMcpRuntime(runtime: ManagedRuntime) {
    if (runtime.cleaned) return
    const sessionId = runtime.webSessionId
    runtime.pendingMcpRestart = false
    runtime.pendingResourceReload = false
    runtime.pendingModelReload = false
    this.eventHub.publish({
      type: "mcp.reload.started",
      sessionId,
      payload: {},
    })
    await this.stop(sessionId)
    await this.cleanup(runtime)
    await this.activate(sessionId)
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

  private async reloadModelSettings() {
    const reloads: Promise<RuntimeSnapshot>[] = []
    for (const runtime of this.runtimes.values()) {
      if (runtime.cleaned) continue
      if (
        runtime.status === "ready" &&
        !runtime.pendingWebUiRestart &&
        !runtime.pendingMcpRestart
      ) {
        reloads.push(this.reloadRuntimeModelSettings(runtime))
      } else if (
        runtime.status === "busy" ||
        runtime.status === "starting" ||
        runtime.pendingWebUiRestart ||
        runtime.pendingMcpRestart
      ) {
        runtime.pendingModelReload = true
      }
    }
    await Promise.all(reloads)
  }

  private scheduleModelSettingsReload(runtime: ManagedRuntime) {
    void this.reloadRuntimeModelSettings(runtime).catch((error: Error) =>
      this.failRuntime(runtime, error)
    )
  }

  private async reloadRuntimeModelSettings(runtime: ManagedRuntime) {
    if (runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    runtime.status = "starting"
    this.eventHub.publish({
      type: "runtime.starting",
      sessionId: runtime.webSessionId,
      payload: { reason: "model-settings-reload" },
    })
    const snapshot = runtimeSnapshotSchema.parse(
      await this.request(runtime, {
        type: "runtime.reload-model-settings",
        requestId: requestId(),
        sessionId: runtime.webSessionId,
      })
    )
    runtime.snapshot = snapshot
    runtime.status = "ready"
    runtime.pendingModelReload = false
    this.eventHub.publish({
      type: "runtime.ready",
      sessionId: runtime.webSessionId,
      payload: snapshot,
    })
    if (runtime.pendingResourceReload) {
      void this.reloadRuntimeResources(runtime).catch((error: Error) =>
        this.failRuntime(runtime, error)
      )
    }
    return snapshot
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
    runtime.failureMessage = error.message
    this.rejectPending(runtime, error)
    runtime.child.kill("SIGTERM")
  }

  private async cleanup(runtime: ManagedRuntime) {
    if (runtime.cleanupPromise) return runtime.cleanupPromise
    runtime.cleanupPromise = (async () => {
      runtime.cleaned = true
      for (const controller of runtime.mcpCalls.values()) controller.abort()
      runtime.mcpCalls.clear()
      if (this.runtimes.get(runtime.webSessionId) === runtime) {
        this.runtimes.delete(runtime.webSessionId)
      }
      if (runtime.lockPath) await rm(runtime.lockPath, { force: true })
    })()
    return runtime.cleanupPromise
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
