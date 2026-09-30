import "server-only"

import { fork, type ChildProcess } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
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
  modelSettingsSnapshotSchema,
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
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type ResourceCatalog,
  type RuntimeSnapshot,
  type RuntimeStatus,
  type SubagentsSnapshot,
  type ModelSettingsProviderInput,
  type ModelSettingsSnapshot,
  type ModelSettings,
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
  archiveProjectSessions as archiveStoredProjectSessions,
  archiveSession as archiveStoredSession,
  bindSessionRuntime,
  deleteArchivedSession as deleteStoredArchivedSession,
  getSessionIdentityByNativeFile,
  getSessionRuntimeTarget,
  isSessionArchived,
  markSessionCompleted as markStoredSessionCompleted,
  markSessionStandalone,
  listSubagentSessions,
  restoreArchivedSession as restoreStoredArchivedSession,
} from "@/lib/catalog"
import { getEventHub, type EventHub } from "@/lib/event-hub"
import { loadConfig } from "@/lib/config"
import type { AppConfig } from "@/lib/config-schema"
import { emitCatalogMetric } from "@/lib/catalog-metrics"
import { getMcpService } from "@/lib/mcp-service"
import {
  readProjectCatalogState,
  type ProjectCatalogState,
} from "@/lib/project-catalog-state"
import type { PromptImage } from "@/lib/prompt-images"
import { syncPiSessionFile } from "@/lib/session-index"
import { RuntimeLiveState } from "@/lib/runtime-live"
import type {
  RuntimeCrash,
  RuntimeDiagnostics,
} from "@/lib/runtime-diagnostics"
import { isRuntimeRequestError, RuntimeRequestError } from "@/lib/runtime-error"
import { assertUpdateAllowed } from "@/lib/update-maintenance"
import {
  resolveNewSessionRuntime,
  resolveNewTaskRuntime,
  runtimeWorkerCredentials,
} from "@/lib/runtime-profiles"
import {
  invalidateWebUiExtensionCatalog,
  webUiAdaptersForRuntime,
} from "@/lib/webui-extensions/registry"

export interface RuntimeState {
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
}

export type PendingExtensionUIRequest = Extract<
  ExtensionUIRequest,
  { method: "select" | "confirm" | "input" | "editor" }
>

export interface PendingExtensionUIView {
  requestId: string
  request: PendingExtensionUIRequest
  expiresAt: number | null
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
  live?: RuntimeLiveState
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
  stopPromise: Promise<void> | null
  stopReason?: "explicit" | "idle-budget"
  resourceReloadPromise: Promise<RuntimeSnapshot> | null
  modelReloadPromise: Promise<RuntimeSnapshot> | null
  runtimeLeases: Map<string, number>
  webUiStatuses: Map<string, WebUiExtensionStatus>
  extensionStatuses: Map<string, string>
  extensionUiRequests?: Map<
    string,
    {
      request: PendingExtensionUIRequest
      expiresAt: number | null
      timeout: NodeJS.Timeout | null
    }
  >
}

interface NewRuntimeOptions {
  runtimeProfileId?: string
  initialMessage?: string
  initialImages?: PromptImage[]
  model?: { provider: string; modelId: string }
  thinkingLevel?: RuntimeSnapshot["thinkingLevel"]
}

const RUNTIME_LEASE_TTL_MS = 3 * 60_000
const DRAFT_CLAIM_RECEIPT_TTL_MS = 5 * 60_000

export interface RuntimeDraftView {
  draftId: string
  leaseToken: string
  projectId: string | null
  runtimeProfileId: string
  runtimeKind: "pi" | "pi-client"
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
}

interface RuntimeDraft {
  draftId: string
  leaseToken: string
  leaseExpiries: Map<string, number>
  projectId: string | null
  cwd: string
  runtimeProfileId: string
  runtimeKind: "pi" | "pi-client"
  draftDirectory: string
  runtime: ManagedRuntime
  claimPromise: Promise<RuntimeDraftClaimResult> | null
  claimResult: RuntimeDraftClaimResult | null
  claimFingerprint: string | null
  claimFailure: { code: string; message: string } | null
  claimedAt: number | null
}

export interface RuntimeDraftClaimResult {
  projectId: string | null
  sessionId: string
  snapshot: RuntimeSnapshot
  operationId?: string
}

export interface ModelSettingsRuntimeTarget {
  cwd: string
  runtimeProfileId: string
  runtimeKind: "pi" | "pi-client"
}

interface ModelCatalogTargetState {
  cwd: string
  agentDir: string
  runtimeProfileId: string
  runtimeKind: ModelSettingsRuntimeTarget["runtimeKind"]
  identityKey: string
  catalogIdentity: string
  dataVersion: string
  securityVersion: string
}

interface ModelCatalogSnapshot {
  catalogIdentity: string
  dataVersion: string
  catalogVersion: string
  snapshot: ModelSettingsSnapshot
}

interface ModelCatalogEntry {
  identityKey: string
  cwd: string
  agentDir: string
  runtimeProfileId: string
  runtimeKind: ModelSettingsRuntimeTarget["runtimeKind"]
  catalogIdentity: string
  generation: number
  revision: number
  dataVersion: string
  securityVersion: string
  snapshots: Map<"all" | "enabled", ModelSettingsSnapshot>
  snapshotCatalogVersion: string | null
  refreshErrors: ModelSettingsSnapshot["refreshErrors"]
  buildPromises: Map<"all" | "enabled", Promise<ModelCatalogSnapshot>>
  refreshPromise: Promise<ModelCatalogSnapshot> | null
  lastUsed: number
}

interface ModelCatalogReadOperation {
  cwd: string
  agentDir: string
  done: Promise<void>
}

interface PendingCatalogWrite {
  scope: CatalogWriteScope
  done: Promise<void>
}

interface CatalogWriteScope {
  kind: "agentDir" | "cwd" | "subtree"
  mode: "write" | "refresh"
  agentDir: string
  cwd?: string
}

interface ModelCatalogWorkerWaiter {
  resolve(release: () => void): void
  reject(error: Error): void
  timeout: NodeJS.Timeout
}

interface ResourceWorkerMetricContext {
  queueWaitMs?: number
  readGateWaitMs?: number
  workerSlotWaitMs?: number
}

interface ResourceWorkerLifecycle {
  onSpawn(): void
  onClose(): void
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
      | "models.refresh"
      | "models.set-scope"
      | "providers.remove"
      | "providers.save"
  }
>

const REQUEST_TIMEOUT_MS = 30_000
const COMPACTION_TIMEOUT_MS = 10 * 60_000
const IDLE_TIMEOUT_MS = 15 * 60_000
const MAX_IDLE_RUNTIMES = 8
const RESOURCE_WORKER_STOP_TIMEOUT_MS = 2_000
const RESOURCE_WORKER_KILL_TIMEOUT_MS = 2_000

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

type RuntimeSupervisorProcessExitCleanup = () => void

declare global {
  var piWebCodexRuntimeSupervisor: RuntimeSupervisor | undefined
  var piWebCodexRuntimeSupervisorExitCleanups:
    Set<RuntimeSupervisorProcessExitCleanup> | undefined
  var piWebCodexRuntimeSupervisorExitHandlerRegistered: boolean | undefined
}

function registerRuntimeSupervisorProcessExitCleanup(
  cleanup: RuntimeSupervisorProcessExitCleanup
) {
  const cleanups = (globalThis.piWebCodexRuntimeSupervisorExitCleanups ??=
    new Set<RuntimeSupervisorProcessExitCleanup>())
  cleanups.add(cleanup)
  if (globalThis.piWebCodexRuntimeSupervisorExitHandlerRegistered) return

  globalThis.piWebCodexRuntimeSupervisorExitHandlerRegistered = true
  process.once("exit", () => {
    for (const registeredCleanup of cleanups) registeredCleanup()
  })
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

const SUPERVISOR_SECRET_ENV_KEYS = [
  "PI_WEB_CODEX_UPDATE_CONTROL_URL",
  "PI_WEB_CODEX_UPDATE_CONTROL_TOKEN",
  "PI_WEB_CODEX_UPDATE_OPERATION_ID",
  "PI_WEB_CODEX_UPDATE_VERIFYING",
  "PI_WEB_CODEX_MUTATION_TOKEN",
] as const

export function workerEnvironment(
  credentials: WorkerCredentials = { kind: "pi" },
  agentDir = getPiAgentDir()
) {
  const environment = { ...process.env }
  environment.PI_CODING_AGENT_DIR = agentDir
  delete environment.PI_SERVER_MODE
  delete environment.PI_SERVER_URL
  delete environment.PI_SERVER_AUTH_TOKEN
  for (const key of SUPERVISOR_SECRET_ENV_KEYS) delete environment[key]
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

class ModelCatalogReadInvalidatedError extends Error {
  constructor() {
    super("The model catalog changed during the read.")
    this.name = "ModelCatalogReadInvalidatedError"
  }
}

export class RuntimeSupervisor {
  private readonly runtimes = new Map<string, ManagedRuntime>()
  private settlementCounts = new Map<ManagedRuntime, number>()
  private runGenerations = new WeakMap<ManagedRuntime, number>()
  private runtimeDrafts = new Map<string, RuntimeDraft>()
  private draftPreparations = new Map<string, Promise<RuntimeDraft>>()
  private readonly knownResources = new Map<string, ResourceCatalog>()
  private knownResourceFingerprints = new Map<string, string>()
  private resourceCatalogFlights = new Map<string, Promise<ResourceCatalog>>()

  liveState(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    return runtime?.live?.capture(runtime.status) ?? null
  }

  settlementPending(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    return runtime ? (this.settlementCounts.get(runtime) ?? 0) > 0 : false
  }

  knownResourceCatalog(cwd: string) {
    return this.knownResources.get(path.resolve(cwd)) ?? null
  }

  private knownResourceCatalogFromState(
    cwd: string,
    state: ProjectCatalogState
  ) {
    const key = path.resolve(cwd)
    const catalog = this.knownResources.get(key)
    const fingerprint = this.knownResourceFingerprints.get(key)
    if (!catalog || !fingerprint) return null
    if (state.resourceFingerprint === fingerprint) {
      this.knownResources.delete(key)
      this.knownResources.set(key, catalog)
      return this.annotateResourceReload(cwd, catalog)
    }
    this.knownResources.delete(key)
    this.knownResourceFingerprints.delete(key)
    return null
  }

  async knownResourceCatalogIfCurrent(cwd: string) {
    const key = path.resolve(cwd)
    if (
      !this.knownResources.has(key) ||
      !this.knownResourceFingerprints.has(key)
    ) {
      return null
    }
    const state = await readProjectCatalogState(cwd, getPiAgentDir())
    return this.knownResourceCatalogFromState(cwd, state)
  }

  async knownSessionCatalogsIfCurrent(
    target: ModelSettingsRuntimeTarget,
    config: AppConfig
  ) {
    const key = path.resolve(target.cwd)
    const projectState = await readProjectCatalogState(
      target.cwd,
      getPiAgentDir()
    )
    const hasResourceCatalog =
      this.knownResources.has(key) && this.knownResourceFingerprints.has(key)
    const resourceCatalog = hasResourceCatalog
      ? this.knownResourceCatalogFromState(target.cwd, projectState)
      : null
    const profile = config.developer.runtime.profiles[target.runtimeProfileId]
    if (!profile?.enabled || profile.kind !== target.runtimeKind) {
      return {
        resourceCatalog,
        modelCatalogBinding: null,
        modelCatalogChecked: true,
      }
    }
    const state = this.modelCatalogStateFromSources(
      target,
      profile,
      projectState
    )
    const entry = this.modelCatalogs.get(state.identityKey)
    const valid =
      entry?.dataVersion === state.dataVersion &&
      entry.securityVersion === state.securityVersion &&
      entry.snapshots.has("enabled") &&
      entry.snapshotCatalogVersion !== null &&
      ![...this.pendingCatalogWrites].some((write) =>
        this.catalogWriteAffectsTarget(write, state)
      )
    return {
      resourceCatalog,
      modelCatalogBinding: valid
        ? {
            catalogIdentity: entry.catalogIdentity,
            catalogVersion: entry.snapshotCatalogVersion!,
          }
        : null,
      modelCatalogChecked: true,
    }
  }

  async currentResourceCatalog(cwd: string) {
    const cached = await this.knownResourceCatalogIfCurrent(cwd)
    return cached ?? (await this.resourceCatalog(cwd))
  }

  private rememberResourceCatalog(
    cwd: string,
    catalog: ResourceCatalog,
    fingerprint: string
  ) {
    const key = path.resolve(cwd)
    this.knownResources.set(key, catalog)
    this.knownResourceFingerprints.set(key, fingerprint)
    while (this.knownResources.size > 48) {
      const oldest = this.knownResources.keys().next().value as
        string | undefined
      if (oldest === undefined) break
      this.knownResources.delete(oldest)
      this.knownResourceFingerprints.delete(oldest)
    }
  }
  private readonly activations = new Map<string, Promise<ManagedRuntime>>()
  private sessionClosures?: Map<string, Promise<unknown>>
  private readonly failures = new Map<string, RuntimeCrash>()
  private readonly eventHub: EventHub
  private readonly idleTimer: NodeJS.Timeout
  private resourceQueue: Promise<void> = Promise.resolve()
  private resourceOperationCount = 0
  private resourceChildren = new Set<ChildProcess>()
  private modelCatalogSalt = randomBytes(32).toString("hex")
  private modelCatalogSequence = 0
  private modelCatalogs = new Map<string, ModelCatalogEntry>()
  private modelCatalogReads = new Set<ModelCatalogReadOperation>()
  private pendingCatalogWrites = new Set<PendingCatalogWrite>()
  private modelCatalogWorkersActive = 0
  private modelCatalogWorkerWaiters: ModelCatalogWorkerWaiter[] = []
  private catalogFenceWaitTimeoutMs = REQUEST_TIMEOUT_MS

  constructor(eventHub = getEventHub()) {
    this.eventHub = eventHub
    this.idleTimer = setInterval(() => this.recycleIdleRuntimes(), 60_000)
    this.idleTimer.unref()
    registerRuntimeSupervisorProcessExitCleanup(() => {
      clearInterval(this.idleTimer)
      for (const runtime of this.runtimes.values()) {
        runtime.child.kill("SIGTERM")
        if (runtime.lockPath) rmSync(runtime.lockPath, { force: true })
      }
    })
  }

  static reuseAfterHotReload(supervisor: RuntimeSupervisor) {
    Object.setPrototypeOf(supervisor, RuntimeSupervisor.prototype)
    supervisor.settlementCounts ??= new Map()
    supervisor.runGenerations ??= new WeakMap()
    supervisor.sessionClosureMap()
    supervisor.resourceQueue ??= Promise.resolve()
    supervisor.resourceOperationCount ??= 0
    supervisor.resourceChildren ??= new Set()
    supervisor.modelCatalogSalt ??= randomBytes(32).toString("hex")
    supervisor.modelCatalogSequence ??= 0
    supervisor.modelCatalogs ??= new Map()
    supervisor.modelCatalogReads ??= new Set()
    supervisor.pendingCatalogWrites ??= new Set()
    supervisor.modelCatalogWorkersActive ??= 0
    supervisor.modelCatalogWorkerWaiters ??= []
    supervisor.catalogFenceWaitTimeoutMs ??= REQUEST_TIMEOUT_MS
    supervisor.knownResourceFingerprints ??= new Map()
    supervisor.resourceCatalogFlights ??= new Map()
    if (
      [...supervisor.modelCatalogs.values()].some(
        (entry) =>
          !(entry.snapshots instanceof Map) ||
          !(entry.buildPromises instanceof Map)
      )
    ) {
      supervisor.modelCatalogs.clear()
    }
    for (const runtime of supervisor.runtimes.values()) {
      runtime.resourceReloadPromise ??= null
      runtime.modelReloadPromise ??= null
      runtime.runtimeLeases ??= new Map()
    }
    supervisor.runtimeDrafts ??= new Map()
    supervisor.draftPreparations ??= new Map()
    return supervisor
  }

  state(sessionId: string): RuntimeState {
    const runtime = this.runtimes.get(sessionId)
    if (runtime) return { status: runtime.status, snapshot: runtime.snapshot }
    return {
      status: this.failures.has(sessionId) ? "crashed" : "stopped",
      snapshot: null,
    }
  }

  /**
   * Check every app-owned runtime operation before a process replacement.
   * This deliberately runs without changing runtime state; callers can use a
   * 409 response without killing a worker or dropping an in-flight request.
   */
  assertUpdateIdle() {
    if (this.activations.size > 0) {
      throw new RuntimeRequestError(
        "RuntimeBusy",
        "Wait for active Pi runtime activation to finish before updating the WebUI."
      )
    }
    if (this.draftPreparations.size > 0) {
      throw new RuntimeRequestError(
        "RuntimeBusy",
        "Wait for the draft runtime preparation to finish before updating the WebUI."
      )
    }
    if (this.sessionClosureMap().size > 0) {
      throw new RuntimeRequestError(
        "RuntimeBusy",
        "Wait for the session operation to finish before updating the WebUI."
      )
    }
    if (this.resourceOperationCount > 0 || this.resourceChildren.size > 0) {
      throw new RuntimeRequestError(
        "RuntimeBusy",
        "Wait for the active resource operation to finish before updating the WebUI."
      )
    }
    if (
      this.modelCatalogReads.size > 0 ||
      this.modelCatalogWorkersActive > 0 ||
      this.modelCatalogWorkerWaiters.length > 0
    ) {
      throw new RuntimeRequestError(
        "RuntimeBusy",
        "Wait for model catalog reads to finish before updating the WebUI."
      )
    }

    for (const draft of this.runtimeDrafts.values()) {
      if (draft.claimPromise) {
        throw new RuntimeRequestError(
          "RuntimeBusy",
          "Wait for the draft message to finish before updating the WebUI."
        )
      }
    }

    for (const runtime of this.runtimes.values()) {
      if (runtime.cleaned) continue
      if (runtime.status !== "ready") {
        throw new RuntimeRequestError(
          "RuntimeBusy",
          `The Pi runtime is ${runtime.status}; wait for it to become idle before updating the WebUI.`
        )
      }
      if (
        runtime.snapshot?.isStreaming ||
        runtime.snapshot?.isCompacting ||
        (runtime.snapshot?.queuedPrompts.length ?? 0) > 0
      ) {
        throw new RuntimeRequestError(
          "RuntimeBusy",
          "A Pi runtime still has active or queued work. Wait for it to become idle before updating the WebUI."
        )
      }
      if (runtime.pending.size > 0 || runtime.mcpCalls.size > 0) {
        throw new RuntimeRequestError(
          "RuntimeBusy",
          "A Pi runtime still has an in-flight request. Wait for it to finish before updating the WebUI."
        )
      }
      if (this.extensionUIRequests(runtime).size > 0) {
        throw new RuntimeRequestError(
          "RuntimeBusy",
          "A Pi runtime is waiting for a UI response. Finish it before updating the WebUI."
        )
      }
      if (
        runtime.resourceReloadPromise ||
        runtime.modelReloadPromise ||
        runtime.webUiRestartPromise ||
        runtime.stopPromise ||
        runtime.pendingResourceReload ||
        runtime.pendingModelReload ||
        runtime.pendingMcpRestart ||
        runtime.pendingWebUiRestart
      ) {
        throw new RuntimeRequestError(
          "RuntimeBusy",
          "A Pi runtime reload is still pending. Wait for it to finish before updating the WebUI."
        )
      }
    }
  }

  async drainForUpdate() {
    this.assertUpdateIdle()
    const runtimes = [...this.runtimes.values()].filter(
      (runtime) => !runtime.cleaned
    )
    const results = await Promise.allSettled(
      runtimes.map(async (runtime) => {
        await this.stop(runtime.webSessionId)
        await runtime.cleanupPromise
      })
    )
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    if (failure) throw failure.reason
  }

  async retainRuntimeLease(sessionId: string, leaseId: string) {
    if (!leaseId) {
      throw new RuntimeRequestError(
        "RuntimeLeaseInvalid",
        "A runtime lease ID is required."
      )
    }
    const runtime = await this.activate(sessionId)
    if (runtime.status !== "ready" && runtime.status !== "busy") {
      throw new RuntimeRequestError(
        "RuntimeUnavailable",
        `The Pi runtime cannot accept a lease while it is ${runtime.status}.`
      )
    }
    this.pruneRuntimeLeases(runtime)
    const now = Date.now()
    this.runtimeLeaseMap(runtime).set(leaseId, now + RUNTIME_LEASE_TTL_MS)
    runtime.lastActivityAt = now
    return this.state(sessionId)
  }

  refreshRuntimeLease(sessionId: string, leaseId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is not active."
      )
    }
    this.pruneRuntimeLeases(runtime)
    if (!this.runtimeLeaseMap(runtime).has(leaseId)) {
      throw new RuntimeRequestError(
        "RuntimeLeaseNotFound",
        "The runtime lease is no longer active."
      )
    }
    const now = Date.now()
    this.runtimeLeaseMap(runtime).set(leaseId, now + RUNTIME_LEASE_TTL_MS)
    runtime.lastActivityAt = now
    return this.state(sessionId)
  }

  releaseRuntimeLease(sessionId: string, leaseId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (runtime && !runtime.cleaned) {
      this.runtimeLeaseMap(runtime).delete(leaseId)
      this.recycleIdleRuntimes()
    }
  }

  async prepareRuntimeDraft(input: {
    draftId: string
    leaseId: string
    projectId: string | null
    runtimeProfileId?: string
    model?: { provider: string; modelId: string }
    thinkingLevel?: RuntimeSnapshot["thinkingLevel"]
  }): Promise<RuntimeDraftView> {
    const target =
      input.projectId === null
        ? await resolveNewTaskRuntime(input.runtimeProfileId)
        : await resolveNewSessionRuntime(
            input.projectId,
            input.runtimeProfileId
          )
    const existing = this.runtimeDrafts.get(input.draftId)
    if (existing) {
      this.assertDraftTarget(existing, target)
      this.pruneDraftLeases(existing)
      if (existing.runtime.cleaned) {
        throw new RuntimeRequestError(
          "RuntimeDraftUnavailable",
          "The draft runtime is no longer active."
        )
      }
      existing.leaseExpiries.set(
        input.leaseId,
        Date.now() + RUNTIME_LEASE_TTL_MS
      )
      return this.runtimeDraftView(existing)
    }

    const inFlight = this.draftPreparations.get(input.draftId)
    if (inFlight) {
      const draft = await inFlight
      this.assertDraftTarget(draft, target)
      draft.leaseExpiries.set(input.leaseId, Date.now() + RUNTIME_LEASE_TTL_MS)
      return this.runtimeDraftView(draft)
    }

    if (this.runtimes.has(input.draftId)) {
      throw new RuntimeRequestError(
        "RuntimeDraftConflict",
        "The requested draft ID is already used by an active runtime."
      )
    }

    const preparation = this.launchRuntimeDraft(input, target, input.draftId)
    this.draftPreparations.set(input.draftId, preparation)
    try {
      const draft = await preparation
      draft.leaseExpiries.set(input.leaseId, Date.now() + RUNTIME_LEASE_TTL_MS)
      return this.runtimeDraftView(draft)
    } finally {
      if (this.draftPreparations.get(input.draftId) === preparation) {
        this.draftPreparations.delete(input.draftId)
      }
    }
  }

  refreshRuntimeDraftLease(
    draftId: string,
    leaseToken: string,
    leaseId: string
  ) {
    const draft = this.requireDraft(draftId, leaseToken)
    if (draft.runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeDraftUnavailable",
        "The draft runtime is no longer active."
      )
    }
    this.pruneDraftLeases(draft)
    if (!draft.leaseExpiries.has(leaseId)) {
      throw new RuntimeRequestError(
        "RuntimeDraftLeaseNotFound",
        "The draft runtime lease is no longer active."
      )
    }
    const now = Date.now()
    draft.leaseExpiries.set(leaseId, now + RUNTIME_LEASE_TTL_MS)
    draft.runtime.lastActivityAt = now
    return this.runtimeDraftView(draft)
  }

  async releaseRuntimeDraft(
    draftId: string,
    leaseToken: string,
    leaseId: string
  ) {
    const draft = this.runtimeDrafts.get(draftId)
    if (!draft) return
    this.assertDraftToken(draft, leaseToken)
    draft.leaseExpiries.delete(leaseId)
    if (draft.claimPromise) return
    if (draft.claimResult) {
      return
    }
    if (draft.claimFailure) {
      return
    }
    this.pruneDraftLeases(draft)
    if (draft.leaseExpiries.size > 0) return
    this.runtimeDrafts.delete(draftId)
    await this.disposeRuntimeDraft(draft)
  }

  async claimRuntimeDraft(input: {
    draftId: string
    leaseToken: string
    leaseId: string
    message: string
    images: PromptImage[]
    model?: { provider: string; modelId: string }
    thinkingLevel?: RuntimeSnapshot["thinkingLevel"]
  }): Promise<RuntimeDraftClaimResult> {
    const draft = this.requireDraft(input.draftId, input.leaseToken)
    const fingerprint = JSON.stringify({
      message: input.message,
      images: input.images,
      model: input.model ?? null,
      thinkingLevel: input.thinkingLevel ?? null,
    })
    if (draft.claimResult) {
      if (draft.claimFingerprint !== fingerprint) {
        throw new RuntimeRequestError(
          "RuntimeDraftConflict",
          "The draft already accepted a different message."
        )
      }
      return draft.claimResult
    }
    if (draft.claimFailure) {
      if (draft.claimFingerprint !== fingerprint) {
        throw new RuntimeRequestError(
          "RuntimeDraftConflict",
          "The draft is already reserved for a different message."
        )
      }
      throw new RuntimeRequestError(
        draft.claimFailure.code,
        draft.claimFailure.message
      )
    }
    this.pruneDraftLeases(draft)
    if (!draft.leaseExpiries.has(input.leaseId)) {
      throw new RuntimeRequestError(
        "RuntimeDraftLeaseNotFound",
        "The draft runtime lease is no longer active."
      )
    }
    if (draft.claimPromise) {
      if (draft.claimFingerprint !== fingerprint) {
        throw new RuntimeRequestError(
          "RuntimeDraftConflict",
          "The draft is already accepting a different message."
        )
      }
      return draft.claimPromise
    }

    draft.claimFingerprint = fingerprint
    const claim = this.completeRuntimeDraftClaim(draft, input).finally(() => {
      if (draft.claimPromise === claim) draft.claimPromise = null
      if (!draft.claimResult && !draft.claimFailure) {
        draft.claimFingerprint = null
      }
    })
    draft.claimPromise = claim
    return claim
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
    while (true) {
      const closure = this.sessionClosureMap().get(sessionId)
      if (!closure) break
      await closure.catch(() => undefined)
    }

    const inFlight = this.activations.get(sessionId)
    if (inFlight) return inFlight

    const current = this.runtimes.get(sessionId)
    if (current && !current.cleaned) {
      if (current.status === "ready" || current.status === "busy") {
        return current
      }
      throw new RuntimeRequestError(
        current.status === "starting" ? "RuntimeBusy" : "RuntimeUnavailable",
        current.status === "starting"
          ? "Wait for the Pi runtime to finish starting before sending work."
          : `The Pi runtime cannot accept work while it is ${current.status}.`
      )
    }

    const activation = this.startRuntime(sessionId).finally(() => {
      if (this.activations.get(sessionId) === activation) {
        this.activations.delete(sessionId)
      }
    })
    this.activations.set(sessionId, activation)
    return activation
  }

  private async readActiveRuntime(sessionId: string) {
    let runtime = this.runtimes.get(sessionId)
    if (runtime?.status === "starting") {
      const activation = this.activations.get(sessionId)
      if (activation) runtime = await activation
    }
    return runtime && !runtime.cleaned ? runtime : null
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
    runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
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
    runtime.snapshot = this.snapshotWithExtensionStatuses(
      runtime,
      runtimeSnapshotSchema.parse(data)
    )
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
    const available = () =>
      runtime.snapshot?.availableModels.some(
        (model) => model.provider === provider && model.id === modelId
      ) ?? false
    if (!available()) {
      if (
        runtime.status !== "ready" ||
        runtime.snapshot?.isStreaming ||
        runtime.snapshot?.isCompacting
      ) {
        throw new RuntimeRequestError(
          "RuntimeBusy",
          "Wait for this session to become idle before applying the refreshed model catalog."
        )
      }
      await this.applyModelCatalogToRuntime(runtime)
      if (!available()) {
        throw new RuntimeRequestError(
          "ModelNotAvailable",
          `Model ${provider}/${modelId} is no longer available in this session runtime.`
        )
      }
    }
    const snapshot = this.snapshotWithExtensionStatuses(
      runtime,
      runtimeSnapshotSchema.parse(
        await this.request(runtime, {
          type: "session.set-model",
          requestId: requestId(),
          sessionId,
          payload: { provider, modelId },
        })
      )
    )
    runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
    return snapshot
  }

  private async applyModelCatalogToRuntime(runtime: ManagedRuntime) {
    this.assertRuntimeReloadable(runtime)
    const previousStatus = runtime.status
    runtime.status = "starting"
    this.eventHub.publish({
      type: "runtime.starting",
      sessionId: runtime.webSessionId,
      payload: { reason: "model-catalog-apply" },
    })
    try {
      const snapshot = this.snapshotWithExtensionStatuses(
        runtime,
        runtimeSnapshotSchema.parse(
          await this.request(runtime, {
            type: "runtime.reload-model-settings",
            requestId: requestId(),
            sessionId: runtime.webSessionId,
          })
        )
      )
      this.assertRuntimeReloadable(runtime)
      runtime.snapshot = snapshot
      runtime.status =
        snapshot.isStreaming || snapshot.isCompacting ? "busy" : "ready"
      this.eventHub.publish({
        type: "runtime.ready",
        sessionId: runtime.webSessionId,
        payload: snapshot,
      })
      return snapshot
    } catch (error) {
      if (
        !runtime.cleaned &&
        this.runtimes.get(runtime.webSessionId) === runtime
      ) {
        runtime.status = previousStatus
        if (runtime.snapshot) {
          this.eventHub.publish({
            type: "runtime.ready",
            sessionId: runtime.webSessionId,
            payload: runtime.snapshot,
          })
        }
      }
      throw error
    }
  }

  async setThinkingLevel(
    sessionId: string,
    level: RuntimeSnapshot["thinkingLevel"]
  ) {
    const runtime = await this.activate(sessionId)
    const snapshot = this.snapshotWithExtensionStatuses(
      runtime,
      runtimeSnapshotSchema.parse(
        await this.request(runtime, {
          type: "session.set-thinking-level",
          requestId: requestId(),
          sessionId,
          payload: { level },
        })
      )
    )
    runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
    return snapshot
  }

  async reload(sessionId: string) {
    const runtime = await this.activateReadyRuntime(sessionId)
    return this.reloadRuntimeResources(runtime)
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
    const snapshot = this.snapshotWithExtensionStatuses(
      runtime,
      runtimeSnapshotSchema.parse(
        await this.request(runtime, {
          type: "session.rename",
          requestId: requestId(),
          sessionId,
          payload: { name },
        })
      )
    )
    runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
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
    runtime.snapshot = this.snapshotWithExtensionStatuses(
      runtime,
      result.snapshot
    )
    runtime.live = new RuntimeLiveState(result.leafId)
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
    const originalLeafId = (await this.tree(sessionId)).leafId
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
    try {
      return await this.prompt(sessionId, input)
    } catch (error) {
      try {
        const rollback = await this.navigateTree(
          sessionId,
          originalLeafId ?? entryId,
          false,
          { restoreEditor: false }
        )
        if (rollback.cancelled) {
          throw new Error("Pi cancelled the message-edit rollback.")
        }
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Message editing failed and the original session branch could not be restored."
        )
      }
      throw error
    }
  }

  async createSession(projectId: string, options: NewRuntimeOptions = {}) {
    const target = await resolveNewSessionRuntime(
      projectId,
      options.runtimeProfileId
    )
    return this.configureNewRuntime(
      await this.launchUnboundRuntime(target, { mode: "new" }, null, options),
      options
    )
  }

  async createTask(options: NewRuntimeOptions = {}) {
    const target = await resolveNewTaskRuntime(options.runtimeProfileId)
    return this.configureNewRuntime(
      await this.launchUnboundRuntime(target, { mode: "new" }, null, options),
      options
    )
  }

  private async configureNewRuntime<
    T extends { sessionId: string; snapshot: RuntimeSnapshot },
  >(created: T, options: NewRuntimeOptions) {
    let snapshot = created.snapshot
    try {
      if (
        options.model &&
        (snapshot.model?.provider !== options.model.provider ||
          snapshot.model?.id !== options.model.modelId)
      ) {
        snapshot = await this.setModel(
          created.sessionId,
          options.model.provider,
          options.model.modelId
        )
      }
      if (
        options.thinkingLevel &&
        snapshot.thinkingLevel !== options.thinkingLevel
      ) {
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
    const runtime = await this.readActiveRuntime(sessionId)
    if (!runtime) {
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
    this.removePendingExtensionUI(runtime, extensionRequestId)
  }

  pendingExtensionUI(sessionId: string): PendingExtensionUIView[] {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) return []
    return [...this.extensionUIRequests(runtime)].map(
      ([requestId, { request, expiresAt }]) => ({
        requestId,
        request,
        expiresAt,
      })
    )
  }

  async tuiSurfaces(sessionId: string) {
    const runtime = await this.readActiveRuntime(sessionId)
    if (!runtime) return []
    return tuiSurfaceSnapshotsSchema.parse(
      await this.request(runtime, {
        type: "tui.surface.list",
        requestId: requestId(),
        sessionId,
      })
    )
  }

  async webUiViews(sessionId: string) {
    const runtime = await this.readActiveRuntime(sessionId)
    if (!runtime) return []
    return webUiViewSnapshotsSchema.parse(
      await this.request(runtime, {
        type: "webui.view.list",
        requestId: requestId(),
        sessionId,
      })
    )
  }

  async subagents(sessionId: string): Promise<SubagentsSnapshot> {
    const runtime = await this.readActiveRuntime(sessionId)
    if (!runtime) {
      return {
        version: 1,
        revision: 0,
        available: false,
        agents: [],
        sessions: await listSubagentSessions(sessionId),
      }
    }
    const snapshot = subagentsSnapshotSchema.parse(
      await this.request(runtime, {
        type: "subagents.snapshot",
        requestId: requestId(),
        sessionId,
      })
    )
    return subagentsSnapshotSchema.parse({
      ...snapshot,
      sessions: await listSubagentSessions(sessionId),
    })
  }

  async stopSubagent(sessionId: string, agentId: string) {
    const runtime = await this.readActiveRuntime(sessionId)
    if (!runtime) {
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

  webUiExtensionSessionIds(projectId: string) {
    return [...this.runtimes.values()]
      .filter((runtime) => !runtime.cleaned && runtime.projectId === projectId)
      .map((runtime) => runtime.webSessionId)
      .sort((left, right) => left.localeCompare(right))
  }

  private snapshotWithExtensionStatuses(
    runtime: ManagedRuntime,
    snapshot: RuntimeSnapshot
  ) {
    return runtimeSnapshotSchema.parse({
      ...snapshot,
      extensionStatuses: runtime.extensionStatuses
        ? Object.fromEntries(runtime.extensionStatuses)
        : snapshot.extensionStatuses,
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

  private catalogOpaqueId(value: string) {
    return createHash("sha256")
      .update(this.modelCatalogSalt)
      .update("\0")
      .update(value)
      .digest("hex")
  }

  private invalidateModelCatalogsForProfile(
    runtimeProfileId: string,
    reason: string
  ) {
    for (const entry of this.modelCatalogs.values()) {
      if (entry.runtimeProfileId !== runtimeProfileId) continue
      entry.generation += 1
      entry.revision += 1
      entry.snapshots.clear()
      entry.snapshotCatalogVersion = null
      entry.refreshErrors = undefined
      entry.buildPromises.clear()
      entry.refreshPromise = null
      this.publishModelCatalogInvalidated(entry.catalogIdentity, reason)
    }
  }

  private async modelCatalogTargetState(
    target: ModelSettingsRuntimeTarget
  ): Promise<ModelCatalogTargetState> {
    const config = await loadConfig()
    const profile = config.developer.runtime.profiles[target.runtimeProfileId]
    if (!profile) {
      this.invalidateModelCatalogsForProfile(
        target.runtimeProfileId,
        "runtime-profile-removed"
      )
      throw new RuntimeRequestError(
        "RuntimeProfileNotFound",
        `Runtime profile ${target.runtimeProfileId} does not exist.`
      )
    }
    if (!profile.enabled) {
      this.invalidateModelCatalogsForProfile(
        target.runtimeProfileId,
        "runtime-profile-disabled"
      )
      throw new RuntimeRequestError(
        "RuntimeProfileDisabled",
        `Runtime profile ${target.runtimeProfileId} is disabled.`
      )
    }
    if (profile.kind !== target.runtimeKind) {
      this.invalidateModelCatalogsForProfile(
        target.runtimeProfileId,
        "runtime-profile-kind-changed"
      )
      throw new RuntimeRequestError(
        "RuntimeProfileMismatch",
        `Runtime profile ${target.runtimeProfileId} changed while handling a model catalog request.`
      )
    }
    const agentDir = getPiAgentDir()
    const projectState = await readProjectCatalogState(target.cwd, agentDir)
    return this.modelCatalogStateFromSources(target, profile, projectState)
  }

  private modelCatalogStateFromSources(
    target: ModelSettingsRuntimeTarget,
    profile: AppConfig["developer"]["runtime"]["profiles"][string],
    projectState: ProjectCatalogState
  ): ModelCatalogTargetState {
    const identityKey = JSON.stringify({
      runtimeProfileId: target.runtimeProfileId,
      runtimeKind: target.runtimeKind,
      agentDir: projectState.canonicalAgentDir,
      cwd: projectState.canonicalCwd,
      trustScope: projectState.trustScope,
    })
    const profileVersion = { ...profile }
    const dataVersion = this.catalogOpaqueId(
      JSON.stringify({
        profile: profileVersion,
        project: projectState.version,
      })
    )
    const securityVersion = this.catalogOpaqueId(
      JSON.stringify({
        profile: profileVersion,
        project: projectState.authVersion,
      })
    )
    return {
      cwd: projectState.canonicalCwd,
      agentDir: projectState.canonicalAgentDir,
      runtimeProfileId: target.runtimeProfileId,
      runtimeKind: target.runtimeKind,
      identityKey,
      catalogIdentity: this.catalogOpaqueId(identityKey),
      dataVersion,
      securityVersion,
    }
  }

  private modelCatalogEntry(state: ModelCatalogTargetState) {
    let entry = this.modelCatalogs.get(state.identityKey)
    if (!entry) {
      for (const previous of this.modelCatalogs.values()) {
        if (
          previous.cwd !== state.cwd ||
          previous.agentDir !== state.agentDir ||
          previous.runtimeProfileId !== state.runtimeProfileId ||
          previous.runtimeKind !== state.runtimeKind ||
          previous.identityKey === state.identityKey ||
          previous.snapshots.size === 0
        ) {
          continue
        }
        previous.generation += 1
        previous.revision += 1
        previous.snapshots.clear()
        previous.snapshotCatalogVersion = null
        previous.refreshErrors = undefined
        previous.buildPromises.clear()
        previous.refreshPromise = null
        this.publishModelCatalogInvalidated(
          previous.catalogIdentity,
          "trust-scope-changed"
        )
      }
      entry = {
        identityKey: state.identityKey,
        cwd: state.cwd,
        agentDir: state.agentDir,
        runtimeProfileId: state.runtimeProfileId,
        runtimeKind: state.runtimeKind,
        catalogIdentity: state.catalogIdentity,
        generation: 0,
        revision: 0,
        dataVersion: state.dataVersion,
        securityVersion: state.securityVersion,
        snapshots: new Map(),
        snapshotCatalogVersion: null,
        refreshErrors: undefined,
        buildPromises: new Map(),
        refreshPromise: null,
        lastUsed: ++this.modelCatalogSequence,
      }
      this.modelCatalogs.set(entry.identityKey, entry)
    } else {
      entry.lastUsed = ++this.modelCatalogSequence
      this.modelCatalogs.delete(entry.identityKey)
      this.modelCatalogs.set(entry.identityKey, entry)
      if (entry.dataVersion !== state.dataVersion) {
        if (
          entry.refreshPromise &&
          entry.securityVersion === state.securityVersion
        ) {
          return entry
        }
        const previousVersion = entry.dataVersion
        entry.generation += 1
        entry.revision += 1
        entry.dataVersion = state.dataVersion
        entry.securityVersion = state.securityVersion
        entry.snapshots.clear()
        entry.snapshotCatalogVersion = null
        entry.refreshErrors = undefined
        entry.buildPromises.clear()
        entry.refreshPromise = null
        if (previousVersion && previousVersion !== state.dataVersion) {
          this.publishModelCatalogInvalidated(
            entry.catalogIdentity,
            "catalog-source-changed"
          )
        }
      }
    }
    this.trimModelCatalogs()
    return entry
  }

  private trimModelCatalogs() {
    while (this.modelCatalogs.size > 32) {
      const oldestSettled = [...this.modelCatalogs].find(
        ([, entry]) => entry.buildPromises.size === 0 && !entry.refreshPromise
      )?.[0]
      if (oldestSettled === undefined) return
      this.modelCatalogs.delete(oldestSettled)
    }
  }

  private modelCatalogVersion(
    state: ModelCatalogTargetState,
    entry: ModelCatalogEntry
  ) {
    return this.catalogOpaqueId(
      JSON.stringify({
        identity: state.catalogIdentity,
        dataVersion: entry.dataVersion,
        revision: entry.revision,
      })
    )
  }

  private currentModelCatalogSnapshot(
    entry: ModelCatalogEntry,
    scope: "all" | "enabled"
  ): ModelCatalogSnapshot {
    const cachedSnapshot = entry.snapshots.get(scope)
    if (!cachedSnapshot || !entry.snapshotCatalogVersion) {
      throw new RuntimeRequestError(
        "ModelCatalogUnavailable",
        "The model catalog does not have a usable snapshot."
      )
    }
    const snapshot = structuredClone(cachedSnapshot)
    if (entry.refreshErrors?.length) {
      snapshot.refreshErrors = structuredClone(entry.refreshErrors)
    }
    return {
      catalogIdentity: entry.catalogIdentity,
      dataVersion: entry.dataVersion,
      catalogVersion: entry.snapshotCatalogVersion,
      snapshot,
    }
  }

  private projectModelSettings(cached: ModelCatalogSnapshot) {
    return modelSettingsSchema.parse({
      ...cached.snapshot,
      catalogIdentity: cached.catalogIdentity,
      catalogVersion: cached.catalogVersion,
    })
  }

  private enabledModelSettingsSnapshot(snapshot: ModelSettingsSnapshot) {
    const models = snapshot.models.filter((model) => model.enabled)
    const selectedDefault = snapshot.defaultModel
    const defaultModel =
      selectedDefault &&
      models.some(
        (model) =>
          model.provider === selectedDefault.provider &&
          model.id === selectedDefault.id
      )
        ? selectedDefault
        : null
    return {
      ...snapshot,
      models,
      providers: [],
      defaultModel,
    }
  }

  private releaseModelCatalogWorker() {
    const waiter = this.modelCatalogWorkerWaiters.shift()
    if (waiter) {
      clearTimeout(waiter.timeout)
      waiter.resolve(() => this.releaseModelCatalogWorker())
      return
    }
    this.modelCatalogWorkersActive = Math.max(
      0,
      this.modelCatalogWorkersActive - 1
    )
  }

  private acquireModelCatalogWorker() {
    if (this.modelCatalogWorkersActive < 4) {
      this.modelCatalogWorkersActive += 1
      return Promise.resolve(() => this.releaseModelCatalogWorker())
    }
    if (this.modelCatalogWorkerWaiters.length >= 32) {
      return Promise.reject(
        new RuntimeRequestError(
          "ModelCatalogBusy",
          "Too many distinct model catalogs are waiting to load. Retry shortly."
        )
      )
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: ModelCatalogWorkerWaiter = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          const index = this.modelCatalogWorkerWaiters.indexOf(waiter)
          if (index < 0) return
          this.modelCatalogWorkerWaiters.splice(index, 1)
          reject(
            new RuntimeRequestError(
              "ModelCatalogBusy",
              "A model catalog worker slot did not become available in time."
            )
          )
        }, REQUEST_TIMEOUT_MS),
      }
      waiter.timeout.unref?.()
      this.modelCatalogWorkerWaiters.push(waiter)
    })
  }

  private async waitForCatalogFences(fences: Promise<void>[]) {
    if (fences.length === 0) return
    let timeout: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        Promise.all(fences),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new RuntimeRequestError(
                  "ModelCatalogBusy",
                  "A related resource worker is still closing. Retry after it stops."
                )
              ),
            this.catalogFenceWaitTimeoutMs
          )
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private catalogWriteScopesOverlap(
    left: CatalogWriteScope,
    right: CatalogWriteScope
  ) {
    if (left.agentDir !== right.agentDir) return false
    if (left.kind === "agentDir" || right.kind === "agentDir") return true
    const leftCwd = path.resolve(left.cwd!)
    const rightCwd = path.resolve(right.cwd!)
    if (left.kind === "cwd" && right.kind === "cwd") {
      return leftCwd === rightCwd
    }
    if (left.kind === "subtree" && right.kind === "cwd") {
      return this.pathIsWithin(leftCwd, rightCwd)
    }
    if (left.kind === "cwd" && right.kind === "subtree") {
      return this.pathIsWithin(rightCwd, leftCwd)
    }
    return (
      this.pathIsWithin(leftCwd, rightCwd) ||
      this.pathIsWithin(rightCwd, leftCwd)
    )
  }

  private async buildModelCatalogSnapshot(
    target: ModelSettingsRuntimeTarget,
    scope: "all" | "enabled",
    expected: ModelCatalogTargetState,
    entry: ModelCatalogEntry,
    generation: number
  ): Promise<ModelCatalogSnapshot> {
    let release!: () => void
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    const read: ModelCatalogReadOperation = {
      cwd: expected.cwd,
      agentDir: expected.agentDir,
      done,
    }
    this.modelCatalogReads.add(read)
    let workerSlotTransferred = false
    let readFenceTransferred = false
    let readFenceReleased = false
    const releaseReadFence = () => {
      if (readFenceReleased) return
      readFenceReleased = true
      this.modelCatalogReads.delete(read)
      release()
    }
    try {
      const readGateStartedAt = Date.now()
      const priorWrites = [...this.pendingCatalogWrites]
        .filter((write) => this.catalogWriteAffectsRead(write, read))
        .map((write) => write.done)
      await this.waitForCatalogFences(priorWrites)
      const readGateWaitMs = Date.now() - readGateStartedAt
      const before = await this.modelCatalogTargetState(target)
      if (
        entry.generation !== generation ||
        before.identityKey !== expected.identityKey ||
        before.dataVersion !== expected.dataVersion
      ) {
        throw new ModelCatalogReadInvalidatedError()
      }
      const workerSlotStartedAt = Date.now()
      const releaseWorker = await this.acquireModelCatalogWorker()
      const workerSlotWaitMs = Date.now() - workerSlotStartedAt
      let snapshot: ModelSettingsSnapshot
      try {
        const beforeFork = await this.modelCatalogTargetState(target)
        if (
          entry.generation !== generation ||
          beforeFork.identityKey !== expected.identityKey ||
          beforeFork.dataVersion !== expected.dataVersion
        ) {
          throw new ModelCatalogReadInvalidatedError()
        }
        this.resourceOperationCount += 1
        try {
          snapshot = modelSettingsSnapshotSchema.parse(
            await this.performResourceRequest(
              {
                type: "models.catalog",
                requestId: requestId(),
                payload: {
                  cwd: expected.cwd,
                  agentDir: expected.agentDir,
                  scope,
                },
              },
              REQUEST_TIMEOUT_MS,
              target,
              { readGateWaitMs, workerSlotWaitMs },
              {
                onSpawn: () => {
                  workerSlotTransferred = true
                  readFenceTransferred = true
                },
                onClose: () => {
                  releaseWorker()
                  releaseReadFence()
                },
              }
            )
          )
        } finally {
          this.resourceOperationCount -= 1
        }
      } finally {
        if (!workerSlotTransferred) releaseWorker()
      }
      const after = await this.modelCatalogTargetState(target)
      if (
        entry.generation !== generation ||
        after.identityKey !== expected.identityKey ||
        after.dataVersion !== expected.dataVersion
      ) {
        throw new ModelCatalogReadInvalidatedError()
      }
      return {
        catalogIdentity: after.catalogIdentity,
        dataVersion: after.dataVersion,
        catalogVersion: "",
        snapshot,
      }
    } finally {
      if (!readFenceTransferred) releaseReadFence()
    }
  }

  private async modelCatalogSnapshot(
    target: ModelSettingsRuntimeTarget,
    scope: "all" | "enabled"
  ): Promise<ModelCatalogSnapshot> {
    const requestStartedAt = Date.now()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const state = await this.modelCatalogTargetState(target)
      const entry = this.modelCatalogEntry(state)
      if (
        scope === "enabled" &&
        !entry.snapshots.has("enabled") &&
        entry.snapshots.has("all")
      ) {
        entry.snapshots.set(
          "enabled",
          this.enabledModelSettingsSnapshot(entry.snapshots.get("all")!)
        )
      }
      const hasSnapshot = entry.snapshots.has(scope)
      const writes = [...this.pendingCatalogWrites]
        .filter(
          (write) =>
            this.catalogWriteAffectsTarget(write, state) &&
            (write.scope.mode === "write" || !hasSnapshot)
        )
        .map((write) => write.done)
      if (writes.length) {
        const waitStartedAt = Date.now()
        await this.waitForCatalogFences(writes)
        emitCatalogMetric("model-catalog-write-barrier", {
          waitMs: Date.now() - waitStartedAt,
          writes: writes.length,
          scope,
        })
        continue
      }
      if (entry.refreshPromise && entry.snapshots.has(scope)) {
        emitCatalogMetric("model-catalog-cache", {
          result: "refresh-snapshot",
          scope,
          durationMs: Date.now() - requestStartedAt,
          activeWorkers: this.modelCatalogWorkersActive,
          queuedWorkers: this.modelCatalogWorkerWaiters.length,
        })
        return this.currentModelCatalogSnapshot(entry, scope)
      }
      if (
        entry.snapshots.has(scope) &&
        entry.dataVersion === state.dataVersion &&
        entry.snapshotCatalogVersion
      ) {
        emitCatalogMetric("model-catalog-cache", {
          result: "hit",
          scope,
          durationMs: Date.now() - requestStartedAt,
          activeWorkers: this.modelCatalogWorkersActive,
          queuedWorkers: this.modelCatalogWorkerWaiters.length,
        })
        return this.currentModelCatalogSnapshot(entry, scope)
      }
      const existingBuild = entry.buildPromises.get(scope)
      if (existingBuild) {
        emitCatalogMetric("model-catalog-cache", {
          result: "singleflight",
          scope,
          activeWorkers: this.modelCatalogWorkersActive,
          queuedWorkers: this.modelCatalogWorkerWaiters.length,
        })
        try {
          await existingBuild
        } catch (error) {
          if (error instanceof ModelCatalogReadInvalidatedError) continue
          throw error
        }
        continue
      }

      const generation = entry.generation
      emitCatalogMetric("model-catalog-cache", {
        result: "miss",
        scope,
        activeWorkers: this.modelCatalogWorkersActive,
        queuedWorkers: this.modelCatalogWorkerWaiters.length,
      })
      const operation = this.buildModelCatalogSnapshot(
        target,
        scope,
        state,
        entry,
        generation
      )
      entry.buildPromises.set(scope, operation)
      try {
        const built = await operation
        if (entry.generation !== generation) continue
        const after = await this.modelCatalogTargetState(target)
        if (
          after.identityKey !== state.identityKey ||
          after.dataVersion !== built.dataVersion
        ) {
          continue
        }
        entry.dataVersion = built.dataVersion
        entry.snapshots.set(scope, structuredClone(built.snapshot))
        entry.refreshErrors = undefined
        if (entry.revision === 0) entry.revision = 1
        entry.snapshotCatalogVersion = this.modelCatalogVersion(after, entry)
        return this.currentModelCatalogSnapshot(entry, scope)
      } catch (error) {
        if (error instanceof ModelCatalogReadInvalidatedError) continue
        throw error
      } finally {
        if (entry.buildPromises.get(scope) === operation) {
          entry.buildPromises.delete(scope)
        }
        this.trimModelCatalogs()
      }
    }
    throw new RuntimeRequestError(
      "ModelCatalogChanged",
      "The model catalog changed repeatedly while it was being read. Retry the request."
    )
  }

  private async storeMutatedModelSettings(
    target: ModelSettingsRuntimeTarget,
    snapshot: ModelSettingsSnapshot
  ) {
    const state = await this.modelCatalogTargetState(target)
    const entry = this.modelCatalogEntry(state)
    entry.generation += 1
    entry.dataVersion = state.dataVersion
    entry.snapshots.set("all", structuredClone(snapshot))
    entry.snapshots.set(
      "enabled",
      structuredClone(this.enabledModelSettingsSnapshot(snapshot))
    )
    entry.refreshErrors = undefined
    entry.revision += 1
    entry.snapshotCatalogVersion = this.modelCatalogVersion(state, entry)
    return this.projectModelSettings(
      this.currentModelCatalogSnapshot(entry, "all")
    )
  }

  private invalidateModelCatalogsAfterRefresh(current: ModelCatalogEntry) {
    for (const entry of this.modelCatalogs.values()) {
      if (entry === current || entry.agentDir !== current.agentDir) {
        continue
      }
      entry.generation += 1
      entry.revision += 1
      entry.snapshots.clear()
      entry.snapshotCatalogVersion = null
      entry.refreshErrors = undefined
      entry.buildPromises.clear()
      this.publishModelCatalogInvalidated(
        entry.catalogIdentity,
        "model-refresh-updated-other-target"
      )
    }
  }

  private catalogWriteScope(
    message: ResourceRequestMessage
  ): CatalogWriteScope | null {
    const agentDir = path.resolve(message.payload.agentDir)
    switch (message.type) {
      case "models.catalog":
      case "resources.catalog":
        return null
      case "models.refresh":
        return { kind: "agentDir", mode: "refresh", agentDir }
      case "models.set-scope":
      case "providers.remove":
      case "providers.save":
        return { kind: "agentDir", mode: "write", agentDir }
      case "resources.set-enabled":
        return message.payload.writeScope === "global"
          ? { kind: "agentDir", mode: "write", agentDir }
          : {
              kind: "cwd",
              mode: "write",
              agentDir,
              cwd: path.resolve(message.payload.cwd),
            }
      case "packages.install":
        return message.payload.scope === "global"
          ? { kind: "agentDir", mode: "write", agentDir }
          : {
              kind: "cwd",
              mode: "write",
              agentDir,
              cwd: path.resolve(message.payload.cwd),
            }
      case "packages.remove":
      case "packages.update":
        return { kind: "agentDir", mode: "write", agentDir }
      case "project.trust.set":
        return {
          kind: "subtree",
          mode: "write",
          agentDir,
          cwd: path.resolve(message.payload.cwd),
        }
    }
  }

  private pathIsWithin(parent: string, child: string) {
    const relative = path.relative(parent, child)
    return (
      relative === "" ||
      (relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative))
    )
  }

  private catalogWriteAffectsRead(
    write: PendingCatalogWrite,
    read: ModelCatalogReadOperation
  ) {
    const scope = write.scope
    if (scope.agentDir !== path.resolve(read.agentDir)) return false
    if (scope.kind === "agentDir") return true
    if (scope.kind === "cwd") {
      return scope.cwd === path.resolve(read.cwd)
    }
    return this.pathIsWithin(scope.cwd!, path.resolve(read.cwd))
  }

  private catalogWriteAffectsTarget(
    write: PendingCatalogWrite,
    target: ModelCatalogTargetState
  ) {
    const scope = write.scope
    if (scope.agentDir !== path.resolve(target.agentDir)) return false
    if (scope.kind === "agentDir") return true
    if (scope.kind === "cwd") return scope.cwd === path.resolve(target.cwd)
    return this.pathIsWithin(scope.cwd!, path.resolve(target.cwd))
  }

  private async invalidateCatalogCachesForWrite(
    scope: CatalogWriteScope,
    message: ResourceRequestMessage
  ) {
    if (message.type === "models.refresh") return []
    const invalidatedModelIdentities: string[] = []
    for (const entry of this.modelCatalogs.values()) {
      const affected =
        scope.agentDir === path.resolve(entry.agentDir) &&
        (scope.kind === "agentDir" ||
          (scope.kind === "cwd" && scope.cwd === path.resolve(entry.cwd)) ||
          (scope.kind === "subtree" &&
            this.pathIsWithin(scope.cwd!, path.resolve(entry.cwd))))
      if (!affected) continue
      entry.generation += 1
      entry.revision += 1
      entry.snapshots.clear()
      entry.snapshotCatalogVersion = null
      entry.refreshErrors = undefined
      entry.buildPromises.clear()
      entry.refreshPromise = null
      invalidatedModelIdentities.push(entry.catalogIdentity)
    }

    if (
      message.type === "packages.remove" ||
      message.type === "packages.update"
    ) {
      await invalidateWebUiExtensionCatalog()
    } else if (message.type === "packages.install") {
      if (message.payload.scope === "global") {
        await invalidateWebUiExtensionCatalog()
      } else {
        await invalidateWebUiExtensionCatalog(message.payload.cwd)
      }
    } else if (message.type === "project.trust.set") {
      await invalidateWebUiExtensionCatalog(message.payload.cwd)
    }
    return [...new Set(invalidatedModelIdentities)]
  }

  private publishModelCatalogInvalidated(
    catalogIdentity: string,
    reason: string,
    catalogVersion?: string,
    kind: "invalidate" | "data-refresh" = "invalidate"
  ) {
    this.eventHub.publish({
      type: "model.catalog.invalidated",
      payload: {
        catalogIdentity,
        reason,
        kind,
        ...(catalogVersion ? { catalogVersion } : {}),
      },
    })
  }

  private publishExtensionCatalogInvalidated(reason: string) {
    this.eventHub.publish({
      type: "webui.extension.catalog.invalidated",
      payload: { kind: "invalidate", reason, all: true },
    })
  }

  private publishResourceWriteInvalidations(
    message: ResourceRequestMessage,
    identities: string[],
    result?: unknown
  ) {
    const settings =
      typeof result === "object" &&
      result !== null &&
      "catalogIdentity" in result &&
      typeof result.catalogIdentity === "string" &&
      "catalogVersion" in result &&
      typeof result.catalogVersion === "string"
        ? (result as Pick<ModelSettings, "catalogIdentity" | "catalogVersion">)
        : null
    for (const identity of identities) {
      if (identity === settings?.catalogIdentity) continue
      this.publishModelCatalogInvalidated(identity, `resource:${message.type}`)
    }
    if (settings) {
      this.publishModelCatalogInvalidated(
        settings.catalogIdentity,
        `resource:${message.type}`,
        settings.catalogVersion
      )
    }
    if (
      message.type === "packages.install" ||
      message.type === "packages.remove" ||
      message.type === "packages.update" ||
      message.type === "project.trust.set"
    ) {
      this.publishExtensionCatalogInvalidated(`resource:${message.type}`)
    }
  }

  async resourceCatalog(cwd: string) {
    const key = path.resolve(cwd)
    const existing = this.resourceCatalogFlights.get(key)
    if (existing) return existing
    const operation = this.readResourceCatalogStable(cwd)
    this.resourceCatalogFlights.set(key, operation)
    try {
      return await operation
    } finally {
      if (this.resourceCatalogFlights.get(key) === operation) {
        this.resourceCatalogFlights.delete(key)
      }
    }
  }

  private async readResourceCatalogStable(cwd: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await readProjectCatalogState(cwd, getPiAgentDir())
      const catalog = resourceCatalogSchema.parse(
        await this.resourceRequest({
          type: "resources.catalog",
          requestId: requestId(),
          payload: {
            cwd: before.canonicalCwd,
            agentDir: before.canonicalAgentDir,
          },
        })
      )
      const after = await readProjectCatalogState(cwd, getPiAgentDir())
      if (before.resourceFingerprint !== after.resourceFingerprint) continue
      this.rememberResourceCatalog(cwd, catalog, after.resourceFingerprint)
      return this.annotateResourceReload(cwd, catalog)
    }
    throw new RuntimeRequestError(
      "ProjectTrustChanged",
      "Project trust or settings changed repeatedly while resources were being read. Retry the request."
    )
  }

  async modelSettings(
    target: ModelSettingsRuntimeTarget,
    scope: "all" | "enabled" = "all"
  ) {
    const cached = await this.modelCatalogSnapshot(target, scope)
    return this.projectModelSettings(cached)
  }

  private async modelRefreshSecurityIsCurrent(
    target: ModelSettingsRuntimeTarget,
    initial: ModelCatalogTargetState,
    entry: ModelCatalogEntry,
    generation: number
  ) {
    let current: ModelCatalogTargetState | null = null
    try {
      current = await this.modelCatalogTargetState(target)
    } catch {
      // A removed or invalid runtime profile cannot keep a prior snapshot.
    }
    const stillCurrent =
      current !== null &&
      current.identityKey === initial.identityKey &&
      current.securityVersion === initial.securityVersion &&
      entry.generation === generation
    if (stillCurrent) return true

    if (entry.generation === generation) {
      entry.generation += 1
      entry.revision += 1
      entry.snapshots.clear()
      entry.snapshotCatalogVersion = null
      entry.refreshErrors = undefined
      entry.buildPromises.clear()
      this.publishModelCatalogInvalidated(
        entry.catalogIdentity,
        "refresh-security-or-target-changed"
      )
    }
    return false
  }

  async refreshModelSettings(target: ModelSettingsRuntimeTarget) {
    await this.modelSettings(target, "all")
    const state = await this.modelCatalogTargetState(target)
    const entry = this.modelCatalogEntry(state)
    if (entry.refreshPromise) {
      return this.projectModelSettings(await entry.refreshPromise)
    }

    const generation = entry.generation
    const operation = (async (): Promise<ModelCatalogSnapshot> => {
      try {
        const refreshed = modelSettingsSnapshotSchema.parse(
          await this.resourceRequest(
            {
              type: "models.refresh",
              requestId: requestId(),
              payload: { cwd: state.cwd, agentDir: state.agentDir },
            },
            REQUEST_TIMEOUT_MS,
            target
          )
        )
        if (
          !(await this.modelRefreshSecurityIsCurrent(
            target,
            state,
            entry,
            generation
          ))
        ) {
          throw new ModelCatalogReadInvalidatedError()
        }
        const errors = refreshed.refreshErrors ?? []
        if (errors.length > 0 && entry.snapshots.has("all")) {
          entry.refreshErrors = errors
          return this.currentModelCatalogSnapshot(entry, "all")
        }

        const currentState = await this.modelCatalogTargetState(target)
        if (
          entry.generation !== generation ||
          currentState.identityKey !== state.identityKey ||
          currentState.dataVersion !== state.dataVersion
        ) {
          throw new ModelCatalogReadInvalidatedError()
        }
        this.invalidateModelCatalogsAfterRefresh(entry)
        entry.dataVersion = currentState.dataVersion
        entry.snapshots.set("all", structuredClone(refreshed))
        entry.snapshots.set(
          "enabled",
          structuredClone(this.enabledModelSettingsSnapshot(refreshed))
        )
        entry.refreshErrors = undefined
        entry.revision += 1
        entry.snapshotCatalogVersion = this.modelCatalogVersion(
          currentState,
          entry
        )
        this.publishModelCatalogInvalidated(
          entry.catalogIdentity,
          "explicit-model-refresh",
          entry.snapshotCatalogVersion,
          "data-refresh"
        )
        return this.currentModelCatalogSnapshot(entry, "all")
      } catch (error) {
        const securityIsCurrent = await this.modelRefreshSecurityIsCurrent(
          target,
          state,
          entry,
          generation
        )
        if (securityIsCurrent && entry.snapshots.has("all")) {
          entry.refreshErrors = [
            {
              provider: "model-catalog",
              message: error instanceof Error ? error.message : String(error),
            },
          ]
          return this.currentModelCatalogSnapshot(entry, "all")
        }
        if (error instanceof ModelCatalogReadInvalidatedError) {
          throw new RuntimeRequestError(
            "ModelCatalogChanged",
            "Authentication, profile, or trust changed during model refresh. Retry the request."
          )
        }
        throw error
      }
    })()
    entry.refreshPromise = operation
    try {
      return this.projectModelSettings(await operation)
    } finally {
      if (entry.refreshPromise === operation) entry.refreshPromise = null
    }
  }

  async setModelScope(
    target: ModelSettingsRuntimeTarget,
    enabledModelIds: string[] | null,
    expectedEnabledModelIds: string[]
  ) {
    const settings = await this.resourceRequest(
      {
        type: "models.set-scope",
        requestId: requestId(),
        payload: {
          cwd: target.cwd,
          agentDir: getPiAgentDir(),
          enabledModelIds,
          expectedEnabledModelIds,
        },
      },
      REQUEST_TIMEOUT_MS,
      target,
      (data) =>
        this.storeMutatedModelSettings(
          target,
          modelSettingsSnapshotSchema.parse(data)
        )
    )
    await this.reloadModelSettings()
    return settings as ModelSettings
  }

  async removeProvider(target: ModelSettingsRuntimeTarget, provider: string) {
    const settings = await this.resourceRequest(
      {
        type: "providers.remove",
        requestId: requestId(),
        payload: { cwd: target.cwd, agentDir: getPiAgentDir(), provider },
      },
      REQUEST_TIMEOUT_MS,
      target,
      (data) =>
        this.storeMutatedModelSettings(
          target,
          modelSettingsSnapshotSchema.parse(data)
        )
    )
    await this.reloadModelSettings()
    return settings as ModelSettings
  }

  async saveCustomProvider(
    target: ModelSettingsRuntimeTarget,
    input: ModelSettingsProviderInput
  ) {
    const settings = await this.resourceRequest(
      {
        type: "providers.save",
        requestId: requestId(),
        payload: { cwd: target.cwd, agentDir: getPiAgentDir(), ...input },
      },
      REQUEST_TIMEOUT_MS,
      target,
      (data) =>
        this.storeMutatedModelSettings(
          target,
          modelSettingsSnapshotSchema.parse(data)
        )
    )
    await this.reloadModelSettings()
    return settings as ModelSettings
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

  async stop(
    sessionId: string,
    reason: "explicit" | "idle-budget" = "explicit"
  ) {
    const activation = this.activations.get(sessionId)
    if (activation) await activation.catch(() => undefined)

    const runtime = this.runtimes.get(sessionId)
    if (!runtime || runtime.cleaned) return
    runtime.stopReason = reason
    if (runtime.stopPromise) return runtime.stopPromise

    const operation = this.stopRuntime(runtime).finally(() => {
      if (runtime.stopPromise === operation) runtime.stopPromise = null
    })
    runtime.stopPromise = operation
    return operation
  }

  private async stopRuntime(runtime: ManagedRuntime) {
    const sessionId = runtime.webSessionId
    runtime.status = "stopping"
    this.eventHub.publish({
      type: "runtime.stopping",
      sessionId,
      payload: { reason: runtime.stopReason ?? "explicit" },
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

  archiveSession(sessionId: string) {
    return this.runSessionClosure([sessionId], async () => {
      await this.stop(sessionId)
      const archivedAt = await archiveStoredSession(sessionId)
      if (!archivedAt) {
        throw new RuntimeRequestError("SessionNotFound", "Session not found.")
      }
      return { sessionId, archivedAt }
    })
  }

  archiveProjectSessions(projectId: string, sessionIds: string[]) {
    const ids = [...new Set(sessionIds)]
    return this.runSessionClosure(ids, async () => {
      for (const sessionId of ids) await this.stop(sessionId)
      return archiveStoredProjectSessions(projectId, ids)
    })
  }

  restoreArchivedSession(sessionId: string) {
    return this.runSessionClosure([sessionId], async () => {
      if (!(await restoreStoredArchivedSession(sessionId))) {
        throw new RuntimeRequestError(
          "SessionNotFound",
          "Archived session not found."
        )
      }
      return { sessionId }
    })
  }

  deleteArchivedSession(sessionId: string) {
    return this.runSessionClosure([sessionId], async () => {
      if (!(await isSessionArchived(sessionId))) {
        throw new RuntimeRequestError(
          "SessionNotFound",
          "Archived session not found."
        )
      }
      await this.stop(sessionId)
      if (!(await deleteStoredArchivedSession(sessionId))) {
        throw new RuntimeRequestError(
          "SessionNotFound",
          "Archived session not found."
        )
      }
      return { sessionId }
    })
  }

  private runSessionClosure<T>(
    sessionIds: string[],
    operation: () => Promise<T>
  ) {
    const ids = [...new Set(sessionIds)]
    const closures = this.sessionClosureMap()
    const previous = [
      ...new Set(
        ids
          .map((sessionId) => closures.get(sessionId))
          .filter((pending): pending is Promise<unknown> => Boolean(pending))
      ),
    ]
    const queued = Promise.all(
      previous.map((pending) => pending.catch(() => undefined))
    ).then(operation)
    const tracked: Promise<T> = queued.finally(() => {
      for (const sessionId of ids) {
        if (closures.get(sessionId) === tracked) {
          closures.delete(sessionId)
        }
      }
    })
    for (const sessionId of ids) closures.set(sessionId, tracked)
    return tracked
  }

  private sessionClosureMap() {
    return (this.sessionClosures ??= new Map())
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

  private runtimeDraftView(draft: RuntimeDraft): RuntimeDraftView {
    return {
      draftId: draft.draftId,
      leaseToken: draft.leaseToken,
      projectId: draft.projectId,
      runtimeProfileId: draft.runtimeProfileId,
      runtimeKind: draft.runtimeKind,
      status: draft.runtime.status,
      snapshot: draft.runtime.snapshot,
    }
  }

  private assertDraftToken(draft: RuntimeDraft, leaseToken: string) {
    if (draft.leaseToken !== leaseToken) {
      throw new RuntimeRequestError(
        "RuntimeDraftUnauthorized",
        "The draft runtime lease token is invalid."
      )
    }
  }

  private requireDraft(draftId: string, leaseToken: string) {
    const draft = this.runtimeDrafts.get(draftId)
    if (!draft) {
      throw new RuntimeRequestError(
        "RuntimeDraftNotFound",
        "The draft runtime does not exist."
      )
    }
    this.assertDraftToken(draft, leaseToken)
    return draft
  }

  private assertDraftTarget(
    draft: RuntimeDraft,
    target: {
      projectId: string | null
      cwd: string
      profileId: string
      runtimeKind: "pi" | "pi-client"
    }
  ) {
    if (
      draft.projectId !== target.projectId ||
      draft.cwd !== target.cwd ||
      draft.runtimeProfileId !== target.profileId ||
      draft.runtimeKind !== target.runtimeKind
    ) {
      throw new RuntimeRequestError(
        "RuntimeDraftConflict",
        "The draft runtime target changed while it was active."
      )
    }
  }

  private pruneDraftLeases(draft: RuntimeDraft) {
    const now = Date.now()
    for (const [leaseId, expiresAt] of draft.leaseExpiries) {
      if (expiresAt <= now) draft.leaseExpiries.delete(leaseId)
    }
  }

  private async launchRuntimeDraft(
    input: {
      draftId: string
      leaseId: string
      projectId: string | null
      model?: { provider: string; modelId: string }
      thinkingLevel?: RuntimeSnapshot["thinkingLevel"]
    },
    target: {
      projectId: string | null
      cwd: string
      profileId: string
      runtimeKind: "pi" | "pi-client"
    },
    draftId: string
  ) {
    const draftDirectory = path.join(
      getAppPaths().temporary,
      "runtime-drafts",
      randomUUID()
    )
    let created: { sessionId: string }
    try {
      created = await this.launchUnboundRuntime(
        target,
        { mode: "new" },
        null,
        {
          ...(input.model ? { model: input.model } : {}),
          ...(input.thinkingLevel
            ? { thinkingLevel: input.thinkingLevel }
            : {}),
        },
        "draft",
        undefined,
        draftDirectory
      )
    } catch (error) {
      await rm(draftDirectory, { recursive: true, force: true })
      throw error
    }
    const runtime = this.runtimes.get(created.sessionId)
    if (!runtime || runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeDraftUnavailable",
        "The draft runtime stopped during initialization."
      )
    }
    const draft: RuntimeDraft = {
      draftId,
      leaseToken: randomUUID(),
      leaseExpiries: new Map(),
      projectId: target.projectId,
      cwd: target.cwd,
      runtimeProfileId: target.profileId,
      runtimeKind: target.runtimeKind,
      draftDirectory,
      runtime,
      claimPromise: null,
      claimResult: null,
      claimFingerprint: null,
      claimFailure: null,
      claimedAt: null,
    }
    this.runtimeDrafts.set(draftId, draft)
    return draft
  }

  private async completeRuntimeDraftClaim(
    draft: RuntimeDraft,
    input: {
      draftId: string
      leaseToken: string
      leaseId: string
      message: string
      images: PromptImage[]
      model?: { provider: string; modelId: string }
      thinkingLevel?: RuntimeSnapshot["thinkingLevel"]
    }
  ): Promise<RuntimeDraftClaimResult> {
    const runtime = draft.runtime
    if (runtime.cleaned) {
      throw new RuntimeRequestError(
        "RuntimeDraftUnavailable",
        "The draft runtime is no longer active."
      )
    }
    let indexedSessionId: string | null = null
    let promptStarted = false
    try {
      if (input.model) {
        await this.setModel(
          runtime.webSessionId,
          input.model.provider,
          input.model.modelId
        )
      }
      if (input.thinkingLevel) {
        await this.setThinkingLevel(runtime.webSessionId, input.thinkingLevel)
      }
      if (!hasAvailableSelectedModel(runtime.snapshot)) {
        throw new RuntimeRequestError(
          "ModelUnavailable",
          "The selected model is unavailable. Configure its Provider credentials or choose an available model."
        )
      }

      const promoted = runtimeSnapshotSchema.parse(
        await this.request(runtime, {
          type: "runtime.promote-session",
          requestId: requestId(),
          payload: { nativeSessionFile: runtime.nativeSessionFile },
        })
      )
      runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, promoted)
      const identity = await getSessionIdentityByNativeFile(
        runtime.nativeSessionFile
      )
      if (
        !identity ||
        identity.nativeSessionId !== runtime.nativeSessionId ||
        identity.nativeSessionFile !== runtime.nativeSessionFile
      ) {
        throw new RuntimeRequestError(
          "SessionIdentityMismatch",
          "The promoted draft session identity did not match the active runtime."
        )
      }
      indexedSessionId = identity.id
      if (draft.projectId === null) {
        await markSessionStandalone(identity.id, {
          cwd: draft.cwd,
          runtimeKind: draft.runtimeKind,
          runtimeProfileId: draft.runtimeProfileId,
        })
      } else {
        if (identity.projectId !== draft.projectId) {
          throw new RuntimeRequestError(
            "SessionProjectMismatch",
            "The promoted draft session belongs to a different project."
          )
        }
        await bindSessionRuntime(
          identity.id,
          draft.runtimeKind,
          draft.runtimeProfileId
        )
      }

      if (identity.id !== draft.draftId) {
        runtime.snapshot = this.snapshotWithExtensionStatuses(
          runtime,
          runtimeSnapshotSchema.parse(
            await this.request(runtime, {
              type: "runtime.rebind-web-session",
              requestId: requestId(),
              payload: { webSessionId: identity.id },
            })
          )
        )
      }
      runtime.lockPath = await this.acquireSessionLock({
        webSessionId: identity.id,
        runtimeProfileId: draft.runtimeProfileId,
        nativeSessionId: identity.nativeSessionId,
        nativeSessionFile: identity.nativeSessionFile,
      })
      const provisionalRuntimeSessionId = runtime.webSessionId
      this.runtimes.delete(provisionalRuntimeSessionId)
      runtime.webSessionId = identity.id
      runtime.nativeSessionId = identity.nativeSessionId
      runtime.nativeSessionFile = identity.nativeSessionFile
      runtime.status = "ready"
      this.runtimes.set(identity.id, runtime)
      this.eventHub.publish({
        type: "runtime.stopped",
        sessionId: provisionalRuntimeSessionId,
        payload: {},
      })
      this.eventHub.publish({
        type: "runtime.ready",
        sessionId: identity.id,
        payload: runtime.snapshot,
      })

      const result: RuntimeDraftClaimResult = {
        projectId: draft.projectId,
        sessionId: identity.id,
        snapshot: runtime.snapshot ?? promoted,
      }
      promptStarted = true
      const accepted = await this.prompt(identity.id, {
        message: input.message,
        images: input.images,
        streamingBehavior: "followUp",
      })
      result.operationId = accepted.operationId
      draft.claimResult = result
      draft.claimedAt = Date.now()
      return result
    } catch (error) {
      if (indexedSessionId) {
        if (
          promptStarted &&
          !(isRuntimeRequestError(error) && error.code === "ModelUnavailable")
        ) {
          draft.claimFailure = {
            code: "RuntimeDraftClaimUncertain",
            message: `The draft prompt result is uncertain for session ${indexedSessionId}; it was not retried to avoid sending a duplicate message.`,
          }
          draft.claimedAt = Date.now()
        } else {
          await this.stop(runtime.webSessionId).catch(() => undefined)
          await archiveStoredSession(indexedSessionId)
          await deleteStoredArchivedSession(indexedSessionId)
          this.runtimeDrafts.delete(draft.draftId)
        }
      }
      throw error
    }
  }

  private async disposeRuntimeDraft(draft: RuntimeDraft) {
    if (draft.claimPromise || draft.claimResult || draft.claimFailure) return
    await this.stop(draft.runtime.webSessionId)
    await rm(draft.runtime.nativeSessionFile, { force: true })
    await rm(draft.draftDirectory, { recursive: true, force: true })
  }

  private isUnclaimedDraftRuntime(runtime: ManagedRuntime) {
    return [...this.runtimeDrafts.values()].some(
      (draft) =>
        draft.runtime === runtime && !draft.claimResult && !draft.claimFailure
    )
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
      runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
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
    migratedFromSessionId: string | null,
    options: Pick<NewRuntimeOptions, "model" | "thinkingLevel"> = {},
    launchMode: "persisted" | "draft" = "persisted",
    provisionalWebSessionId = randomUUID(),
    draftDirectory?: string
  ) {
    if (launchMode === "draft" && !draftDirectory) {
      throw new RuntimeRequestError(
        "RuntimeDraftUnavailable",
        "A draft runtime requires an isolated storage directory."
      )
    }
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

    // All preparation awaits above can yield to the update request.  Check
    // immediately before forking so no new app-owned worker can escape the
    // maintenance gate.
    assertUpdateAllowed()
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
      stopPromise: null,
      resourceReloadPromise: null,
      modelReloadPromise: null,
      runtimeLeases: new Map(),
      webUiStatuses: new Map(),
      extensionStatuses: new Map(),
      extensionUiRequests: new Map(),
    }
    if (this.runtimes.has(provisionalWebSessionId)) {
      child.kill("SIGTERM")
      throw new RuntimeRequestError(
        "RuntimeSessionConflict",
        "The generated runtime session ID is already active."
      )
    }
    this.runtimes.set(provisionalWebSessionId, managed)
    this.bindChild(managed)
    this.eventHub.publish({
      type: "runtime.starting",
      sessionId: provisionalWebSessionId,
      payload: {},
    })

    try {
      let snapshot = this.snapshotWithExtensionStatuses(
        managed,
        runtimeSnapshotSchema.parse(
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
              ...(launchMode === "draft" ? { draft: true } : {}),
              ...(launchMode === "draft" && draftDirectory
                ? { draftDirectory }
                : {}),
              ...(options.model ? { model: options.model } : {}),
              ...(options.thinkingLevel
                ? { thinkingLevel: options.thinkingLevel }
                : {}),
            },
          })
        )
      )
      if (launchMode === "draft") {
        managed.nativeSessionId = snapshot.nativeSessionId
        managed.nativeSessionFile = snapshot.nativeSessionFile
        managed.snapshot = snapshot
        managed.status = "ready"
        this.eventHub.publish({
          type: "runtime.ready",
          sessionId: provisionalWebSessionId,
          payload: snapshot,
        })
        return {
          projectId: target.projectId,
          sessionId: provisionalWebSessionId,
          snapshot,
        }
      }
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
        snapshot = this.snapshotWithExtensionStatuses(
          managed,
          runtimeSnapshotSchema.parse(
            await this.request(managed, {
              type: "runtime.rebind-web-session",
              requestId: requestId(),
              payload: { webSessionId: identity.id },
            })
          )
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
      managed.snapshot = this.snapshotWithExtensionStatuses(managed, snapshot)
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

    // The lock/path/MCP awaits above may overlap an update request.
    assertUpdateAllowed()
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
      stopPromise: null,
      resourceReloadPromise: null,
      modelReloadPromise: null,
      runtimeLeases: new Map(),
      webUiStatuses: new Map(),
      extensionStatuses: new Map(),
      extensionUiRequests: new Map(),
    }
    this.runtimes.set(sessionId, managed)
    this.bindChild(managed)
    this.eventHub.publish({
      type: "runtime.starting",
      sessionId,
      payload: {},
    })

    try {
      const snapshot = this.snapshotWithExtensionStatuses(
        managed,
        runtimeSnapshotSchema.parse(
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
      )
      if (snapshot.nativeSessionId !== target.nativeSessionId) {
        throw new RuntimeRequestError(
          "SessionIdentityMismatch",
          "The Pi worker opened a different native session."
        )
      }
      managed.snapshot = this.snapshotWithExtensionStatuses(managed, snapshot)
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
          payload: { reason: runtime.stopReason ?? "explicit" },
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
      let expiresAt: number | null | undefined
      if (message.payload.method === "setStatus") {
        if (message.payload.statusText === undefined) {
          runtime.extensionStatuses.delete(message.payload.statusKey)
        } else {
          runtime.extensionStatuses.set(
            message.payload.statusKey,
            message.payload.statusText
          )
        }
        if (runtime.snapshot) {
          runtime.snapshot = this.snapshotWithExtensionStatuses(
            runtime,
            runtime.snapshot
          )
        }
      }
      if (
        message.payload.method === "select" ||
        message.payload.method === "confirm" ||
        message.payload.method === "input" ||
        message.payload.method === "editor"
      ) {
        expiresAt = this.trackPendingExtensionUI(
          runtime,
          message.requestId,
          message.payload
        )
      }
      this.eventHub.publish({
        type: "extension.ui.request",
        sessionId: runtime.webSessionId,
        payload: {
          requestId: message.requestId,
          ...message.payload,
          ...(expiresAt === undefined ? {} : { expiresAt }),
        },
      })
      return
    }
    if (message.type === "extension.ui.closed") {
      this.removePendingExtensionUI(runtime, message.requestId)
      this.eventHub.publish({
        type: "extension.ui.closed",
        sessionId: runtime.webSessionId,
        payload: { requestId: message.requestId },
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
      runtime.snapshot = this.snapshotWithExtensionStatuses(
        runtime,
        message.payload
      )
      runtime.status =
        runtime.snapshot.isStreaming || runtime.snapshot.isCompacting
          ? "busy"
          : "ready"
      runtime.live = new RuntimeLiveState(runtime.snapshot.leafId)
      this.resolvePending(runtime, message.requestId, runtime.snapshot)
      this.eventHub.publish({
        type: "runtime.ready",
        sessionId: runtime.webSessionId,
        payload: runtime.snapshot,
      })
      this.schedulePendingRuntimeWork(runtime)
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
      this.runGenerations.set(
        runtime,
        (this.runGenerations.get(runtime) ?? 0) + 1
      )
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
    const publishDomainEvent = () => {
      const event = this.eventHub.publish({
        type: DOMAIN_EVENT_TYPES[message.eventType] ?? "session.event",
        sessionId: runtime.webSessionId,
        payload: message.payload,
      })
      runtime.live?.apply(event)
      return event
    }

    if (message.eventType === "agent_settled") {
      const generation = this.runGenerations.get(runtime) ?? 0
      const settlingLive = runtime.live
      const sameIdleRun = () =>
        !runtime.cleaned &&
        this.runtimes.get(runtime.webSessionId) === runtime &&
        runtime.live === settlingLive &&
        (this.runGenerations.get(runtime) ?? 0) === generation &&
        runtime.status === "ready"
      this.settlementCounts.set(
        runtime,
        (this.settlementCounts.get(runtime) ?? 0) + 1
      )
      void (async () => {
        while (sameIdleRun()) {
          const revision = runtime.live?.revision
          await this.refreshSettledRuntimeSnapshot(runtime, revision)
          if (!sameIdleRun()) return
          if (revision !== runtime.live?.revision) continue
          await syncPiSessionFile(runtime.nativeSessionFile)
          if (!sameIdleRun()) return
          if (revision !== runtime.live?.revision) continue
          const updated = await markStoredSessionCompleted(runtime.webSessionId)
          if (!updated) {
            throw new RuntimeRequestError(
              "SessionNotFound",
              `Cannot mark missing Web session ${runtime.webSessionId} completed.`
            )
          }
          if (!sameIdleRun()) return
          if (revision !== runtime.live?.revision) continue
          if (runtime.snapshot)
            runtime.live?.checkpoint(revision!, runtime.snapshot.leafId)
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
            void this.reloadRuntimeResources(runtime).catch((error: Error) => {
              console.error("Could not reload Pi runtime resources:", error)
            })
          }
          return
        }
      })()
        .catch((error: unknown) =>
          this.failRuntime(
            runtime,
            error instanceof Error ? error : new Error(String(error))
          )
        )
        .finally(() => {
          const remaining = (this.settlementCounts.get(runtime) ?? 1) - 1
          if (remaining > 0) this.settlementCounts.set(runtime, remaining)
          else this.settlementCounts.delete(runtime)
        })
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
    if (message.type !== "runtime.shutdown") assertUpdateAllowed()
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
    timeoutMs = REQUEST_TIMEOUT_MS,
    runtimeTarget?: ModelSettingsRuntimeTarget,
    onSuccess?: (data: unknown) => unknown | Promise<unknown>
  ) {
    this.resourceOperationCount += 1
    if (message.type === "models.catalog") {
      const directRead = this.performResourceRequest(
        message,
        timeoutMs,
        runtimeTarget
      ).then((data) => (onSuccess ? onSuccess(data) : data))
      return directRead.finally(() => {
        this.resourceOperationCount -= 1
      })
    }

    const scope = this.catalogWriteScope(message)
    const queuedAt = Date.now()
    const blockedWrites = scope
      ? [...this.pendingCatalogWrites]
          .filter((write) => this.catalogWriteScopesOverlap(scope, write.scope))
          .map((write) => write.done)
      : []
    const blockedReads = scope
      ? [...this.modelCatalogReads]
          .filter((read) => {
            const temporaryWrite: PendingCatalogWrite = {
              scope,
              done: Promise.resolve(),
            }
            return this.catalogWriteAffectsRead(temporaryWrite, read)
          })
          .map((read) => read.done)
      : []
    let finishWrite!: () => void
    const pendingWrite = scope
      ? {
          scope,
          done: new Promise<void>((resolve) => {
            finishWrite = resolve
          }),
        }
      : null
    if (pendingWrite) this.pendingCatalogWrites.add(pendingWrite)
    let workerFenceTransferred = false
    let pendingWriteFinished = false
    const finishPendingWrite = () => {
      if (!pendingWrite || pendingWriteFinished) return
      pendingWriteFinished = true
      this.pendingCatalogWrites.delete(pendingWrite)
      finishWrite()
    }
    const workerLifecycle: ResourceWorkerLifecycle | undefined = pendingWrite
      ? {
          onSpawn: () => {
            workerFenceTransferred = true
          },
          onClose: finishPendingWrite,
        }
      : undefined

    const operation = this.resourceQueue
      .then(async () => {
        const queueWaitMs = Date.now() - queuedAt
        const readGateStartedAt = Date.now()
        await this.waitForCatalogFences([...blockedReads, ...blockedWrites])
        const readGateWaitMs = Date.now() - readGateStartedAt
        let data: unknown
        try {
          data = await this.performResourceRequest(
            message,
            timeoutMs,
            runtimeTarget,
            { queueWaitMs, readGateWaitMs },
            workerLifecycle
          )
        } catch (error) {
          if (scope) {
            const identities = await this.invalidateCatalogCachesForWrite(
              scope,
              message
            )
            this.publishResourceWriteInvalidations(message, identities)
          }
          throw error
        }
        if (!scope) return onSuccess ? onSuccess(data) : data

        const invalidatedModelIdentities =
          await this.invalidateCatalogCachesForWrite(scope, message)
        let result: unknown
        try {
          result = onSuccess ? await onSuccess(data) : data
        } finally {
          this.publishResourceWriteInvalidations(
            message,
            invalidatedModelIdentities,
            result
          )
        }
        return result
      })
      .finally(() => {
        this.resourceOperationCount -= 1
        if (!workerFenceTransferred) finishPendingWrite()
      })
    this.resourceQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private async performResourceRequest(
    message: ResourceRequestMessage,
    timeoutMs: number,
    runtimeTarget?: ModelSettingsRuntimeTarget,
    metricContext: ResourceWorkerMetricContext = {},
    lifecycle?: ResourceWorkerLifecycle
  ) {
    const requestStartedAt = Date.now()
    const credentialStartedAt = Date.now()
    const credentials = runtimeTarget
      ? await runtimeWorkerCredentials(runtimeTarget.runtimeProfileId)
      : { kind: "pi" as const }
    const credentialResolveMs = Date.now() - credentialStartedAt
    if (runtimeTarget && credentials.kind !== runtimeTarget.runtimeKind) {
      throw new RuntimeRequestError(
        "RuntimeProfileMismatch",
        `Runtime profile ${runtimeTarget.runtimeProfileId} changed while handling a model resource request.`
      )
    }
    const workerPathStartedAt = Date.now()
    const workerPath = await realpath(
      credentials.kind === "pi-client"
        ? getPiClientWorkerPath()
        : getPiWorkerPath()
    )
    await access(workerPath)
    const workerPathResolveMs = Date.now() - workerPathStartedAt
    assertUpdateAllowed()
    const child = fork(workerPath, [], {
      cwd: message.payload.cwd,
      env: workerEnvironment(credentials),
      execArgv: [],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    })
    const forkedAt = Date.now()
    this.resourceChildren.add(child)
    lifecycle?.onSpawn()
    return new Promise<unknown>((resolve, reject) => {
      type ResourceOutcome =
        { kind: "success"; data: unknown } | { kind: "failure"; error: Error }

      let settled = false
      let exited = child.exitCode !== null || child.signalCode !== null
      let closed = false
      let terminationStarted = false
      let outcome: ResourceOutcome | null = null
      let responseAt: number | null = null
      let outcomeAt: number | null = null
      let closeAt: number | null = null
      let metricsEmitted = false
      let workerMetrics: Record<string, number> | undefined
      let stderr = ""
      let timeout: NodeJS.Timeout | undefined
      let stopTimeout: NodeJS.Timeout | undefined
      let killTimeout: NodeJS.Timeout | undefined
      child.stderr?.setEncoding("utf8")
      const onStderr = (chunk: string) => {
        stderr += chunk
        if (stderr.length > 4_000) stderr = stderr.slice(-4_000)
      }
      child.stderr?.on("data", onStderr)

      const clearTimers = () => {
        if (timeout) clearTimeout(timeout)
        if (stopTimeout) clearTimeout(stopTimeout)
        if (killTimeout) clearTimeout(killTimeout)
        timeout = undefined
        stopTimeout = undefined
        killTimeout = undefined
      }

      const removeRequestListeners = () => {
        child.off("message", onMessage)
        child.off("error", onError)
        child.stderr?.off("data", onStderr)
      }

      const stopTracking = () => {
        this.resourceChildren.delete(child)
        child.off("exit", onExit)
        child.off("close", onClose)
      }

      const emitMetrics = () => {
        if (metricsEmitted) return
        metricsEmitted = true
        emitCatalogMetric("resource-worker", {
          requestType: message.type,
          runtimeKind: credentials.kind,
          outcome: outcome?.kind ?? "failure",
          queueWaitMs: metricContext.queueWaitMs,
          readGateWaitMs: metricContext.readGateWaitMs,
          workerSlotWaitMs: metricContext.workerSlotWaitMs,
          credentialResolveMs,
          workerPathResolveMs,
          forkToResponseMs: responseAt === null ? null : responseAt - forkedAt,
          responseToCloseMs:
            responseAt === null || closeAt === null
              ? null
              : closeAt - responseAt,
          outcomeToCloseMs:
            outcomeAt === null || closeAt === null ? null : closeAt - outcomeAt,
          ...(workerMetrics ?? {}),
          totalMs: (closeAt ?? Date.now()) - requestStartedAt,
          activeWorkers: this.resourceChildren.size,
          inFlightOperations: this.resourceOperationCount,
        })
      }

      const finishAfterExit = () => {
        if (!closed) return
        if (settled) {
          removeRequestListeners()
          stopTracking()
          emitMetrics()
          return
        }
        settled = true
        clearTimers()
        removeRequestListeners()
        stopTracking()
        emitMetrics()
        if (outcome?.kind === "success") resolve(outcome.data)
        else {
          reject(
            outcome?.error ??
              new RuntimeRequestError(
                "ResourceWorkerExited",
                "The Pi resource worker exited before returning a response."
              )
          )
        }
      }

      const hardStop = () => {
        if (closed || settled) {
          if (closed) finishAfterExit()
          return
        }
        try {
          child.kill("SIGKILL")
        } catch {
          // The exit event or the bounded timeout below supplies the result.
        }
        killTimeout = setTimeout(() => {
          if (closed || settled) {
            if (closed) finishAfterExit()
            return
          }
          settled = true
          clearTimers()
          removeRequestListeners()
          // Keep the exit listener and resourceChildren entry until the child
          // is actually observed exiting. Update preparation must still see a
          // child that ignores both termination signals as busy.
          reject(
            new RuntimeRequestError(
              "ResourceWorkerStopTimeout",
              "The Pi resource worker did not exit after termination was requested."
            )
          )
        }, RESOURCE_WORKER_KILL_TIMEOUT_MS)
        killTimeout.unref?.()
      }

      const terminate = () => {
        if (terminationStarted || exited) {
          if (closed) finishAfterExit()
          return
        }
        terminationStarted = true
        try {
          child.kill("SIGTERM")
        } catch {
          // Continue to the bounded SIGKILL attempt.
        }
        stopTimeout = setTimeout(() => {
          if (closed || settled) {
            if (closed) finishAfterExit()
            return
          }
          hardStop()
        }, RESOURCE_WORKER_STOP_TIMEOUT_MS)
        stopTimeout.unref?.()
      }

      const recordOutcome = (next: ResourceOutcome) => {
        if (outcome || settled) return
        outcome = next
        outcomeAt = Date.now()
        if (timeout) clearTimeout(timeout)
        timeout = undefined
        if (closed) finishAfterExit()
        else terminate()
      }

      const awaitClose = () => {
        if (closed || settled || stopTimeout) {
          if (closed) finishAfterExit()
          return
        }
        stopTimeout = setTimeout(() => {
          if (closed || settled) {
            if (closed) finishAfterExit()
            return
          }
          settled = true
          clearTimers()
          removeRequestListeners()
          // Keep the close listener and resourceChildren entry until the
          // operating system confirms that the child's stdio is released.
          reject(
            new RuntimeRequestError(
              "ResourceWorkerStopTimeout",
              "The Pi resource worker did not close after exiting."
            )
          )
        }, RESOURCE_WORKER_STOP_TIMEOUT_MS)
        stopTimeout.unref?.()
      }

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        exited = true
        if (timeout) clearTimeout(timeout)
        timeout = undefined
        if (stopTimeout) clearTimeout(stopTimeout)
        stopTimeout = undefined
        if (killTimeout) clearTimeout(killTimeout)
        killTimeout = undefined
        if (!outcome) {
          outcome = {
            kind: "failure",
            error: new RuntimeRequestError(
              "ResourceWorkerExited",
              `The Pi resource worker exited (${signal ?? code ?? "unknown"}).${
                stderr.trim() ? `\n${stderr.trim()}` : ""
              }`
            ),
          }
        }
        awaitClose()
      }

      const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
        closed = true
        closeAt = Date.now()
        exited = true
        this.resourceChildren.delete(child)
        lifecycle?.onClose()
        if (!outcome) {
          outcome = {
            kind: "failure",
            error: new RuntimeRequestError(
              "ResourceWorkerExited",
              `The Pi resource worker closed (${signal ?? code ?? "unknown"}).${
                stderr.trim() ? `\n${stderr.trim()}` : ""
              }`
            ),
          }
        }
        finishAfterExit()
      }

      const onError = (error: Error) => {
        recordOutcome({ kind: "failure", error })
      }

      const onMessage = (raw: unknown) => {
        const parsed = workerToHostMessageSchema.safeParse(raw)
        if (!parsed.success) {
          recordOutcome({
            kind: "failure",
            error: new RuntimeRequestError(
              "InvalidWorkerMessage",
              parsed.error.message
            ),
          })
          return
        }
        const response = parsed.data
        if (
          response.type !== "runtime.response" ||
          response.requestId !== message.requestId
        ) {
          return
        }
        responseAt = Date.now()
        workerMetrics = response.metrics
        if (response.success) {
          recordOutcome({ kind: "success", data: response.data })
        } else {
          recordOutcome({
            kind: "failure",
            error: new RuntimeRequestError(
              response.error?.code ?? "ResourceRequestFailed",
              response.error?.message ?? "The Pi resource request failed."
            ),
          })
        }
      }

      child.once("exit", onExit)
      child.once("close", onClose)
      child.on("error", onError)
      child.on("message", onMessage)
      timeout = setTimeout(
        () =>
          recordOutcome({
            kind: "failure",
            error: new RuntimeRequestError(
              "ResourceRequestTimeout",
              `The Pi resource worker did not answer within ${timeoutMs}ms.`
            ),
          }),
        timeoutMs
      )
      timeout.unref?.()
      try {
        child.send(message, (error) => {
          if (error) recordOutcome({ kind: "failure", error })
        })
      } catch (error) {
        recordOutcome({
          kind: "failure",
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
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
    const catalog = await this.currentResourceCatalog(cwd)
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
    if (this.isUnclaimedDraftRuntime(runtime)) {
      throw new RuntimeRequestError(
        "RuntimeDraftUnavailable",
        "The draft runtime must be claimed before WebUI extensions can reload."
      )
    }
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
    if (this.isUnclaimedDraftRuntime(runtime)) {
      throw new RuntimeRequestError(
        "RuntimeDraftUnavailable",
        "The draft runtime must be claimed before MCP servers can reload."
      )
    }
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
    if (global) {
      this.knownResources.clear()
      this.knownResourceFingerprints.clear()
    } else {
      const key = path.resolve(cwd)
      this.knownResources.delete(key)
      this.knownResourceFingerprints.delete(key)
    }
    const reloads: Promise<RuntimeSnapshot>[] = []
    for (const runtime of this.runtimes.values()) {
      if (!global && path.resolve(runtime.cwd) !== path.resolve(cwd)) continue
      if (runtime.resourceReloadPromise || runtime.status === "ready") {
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
        (runtime.modelReloadPromise || runtime.status === "ready") &&
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
    void this.reloadRuntimeModelSettings(runtime).catch((error: Error) => {
      console.error("Could not reload Pi runtime model settings:", error)
    })
  }

  private reloadRuntimeModelSettings(runtime: ManagedRuntime) {
    runtime.pendingModelReload = true
    if (runtime.modelReloadPromise) return runtime.modelReloadPromise

    const operation = this.drainRuntimeModelReloads(runtime).finally(() => {
      if (runtime.modelReloadPromise === operation) {
        runtime.modelReloadPromise = null
      }
    })
    runtime.modelReloadPromise = operation
    return operation
  }

  private async drainRuntimeModelReloads(runtime: ManagedRuntime) {
    let latest = runtime.snapshot
    try {
      while (runtime.pendingModelReload) {
        runtime.pendingModelReload = false
        this.assertRuntimeReloadable(runtime)
        runtime.status = "starting"
        this.eventHub.publish({
          type: "runtime.starting",
          sessionId: runtime.webSessionId,
          payload: { reason: "model-settings-reload" },
        })
        const snapshot = this.snapshotWithExtensionStatuses(
          runtime,
          runtimeSnapshotSchema.parse(
            await this.request(runtime, {
              type: "runtime.reload-model-settings",
              requestId: requestId(),
              sessionId: runtime.webSessionId,
            })
          )
        )
        this.assertRuntimeReloadable(runtime)
        latest = snapshot
        runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
        runtime.status = "ready"
        this.eventHub.publish({
          type: "runtime.ready",
          sessionId: runtime.webSessionId,
          payload: snapshot,
        })
      }
    } catch (error) {
      runtime.pendingModelReload = false
      if (!runtime.cleaned && runtime.status !== "stopping") {
        this.failRuntime(
          runtime,
          error instanceof Error ? error : new Error(String(error))
        )
      }
      throw error
    }
    if (!latest) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime has no model settings snapshot."
      )
    }
    this.schedulePendingRuntimeWork(runtime)
    return latest
  }

  private reloadRuntimeResources(runtime: ManagedRuntime) {
    runtime.pendingResourceReload = true
    if (runtime.resourceReloadPromise) return runtime.resourceReloadPromise

    const operation = this.drainRuntimeResourceReloads(runtime).finally(() => {
      if (runtime.resourceReloadPromise === operation) {
        runtime.resourceReloadPromise = null
      }
    })
    runtime.resourceReloadPromise = operation
    return operation
  }

  private async drainRuntimeResourceReloads(runtime: ManagedRuntime) {
    let latest = runtime.snapshot
    try {
      while (runtime.pendingResourceReload) {
        runtime.pendingResourceReload = false
        this.assertRuntimeReloadable(runtime)
        runtime.status = "starting"
        this.eventHub.publish({
          type: "runtime.starting",
          sessionId: runtime.webSessionId,
          payload: { reason: "resources-reload" },
        })
        const snapshot = this.snapshotWithExtensionStatuses(
          runtime,
          runtimeSnapshotSchema.parse(
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
        )
        this.assertRuntimeReloadable(runtime)
        latest = snapshot
        runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
        runtime.status = "ready"
        this.eventHub.publish({
          type: "runtime.ready",
          sessionId: runtime.webSessionId,
          payload: snapshot,
        })
      }
    } catch (error) {
      runtime.pendingResourceReload = false
      if (!runtime.cleaned && runtime.status !== "stopping") {
        this.failRuntime(
          runtime,
          error instanceof Error ? error : new Error(String(error))
        )
      }
      throw error
    }
    if (!latest) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime has no resource snapshot."
      )
    }
    this.schedulePendingRuntimeWork(runtime)
    return latest
  }

  private schedulePendingRuntimeWork(runtime: ManagedRuntime) {
    if (runtime.cleaned || runtime.status !== "ready") return
    if (runtime.pendingWebUiRestart) {
      setImmediate(() => this.scheduleWebUiRestart(runtime))
    } else if (runtime.pendingMcpRestart) {
      setImmediate(() => this.scheduleMcpRestart(runtime))
    } else if (runtime.pendingModelReload) {
      setImmediate(() => this.scheduleModelSettingsReload(runtime))
    } else if (runtime.pendingResourceReload) {
      setImmediate(() => {
        void this.reloadRuntimeResources(runtime).catch((error: Error) => {
          console.error("Could not reload Pi runtime resources:", error)
        })
      })
    }
  }

  private assertRuntimeReloadable(runtime: ManagedRuntime) {
    if (
      runtime.cleaned ||
      runtime.status === "stopping" ||
      this.runtimes.get(runtime.webSessionId) !== runtime
    ) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The Pi runtime is no longer active."
      )
    }
  }

  private async refreshSettledRuntimeSnapshot(
    runtime: ManagedRuntime,
    revision = runtime.live?.revision
  ) {
    const snapshot = this.snapshotWithExtensionStatuses(
      runtime,
      runtimeSnapshotSchema.parse(
        await this.request(runtime, {
          type: "session.snapshot",
          requestId: requestId(),
          sessionId: runtime.webSessionId,
        })
      )
    )
    if (
      runtime.cleaned ||
      this.runtimes.get(runtime.webSessionId) !== runtime
    ) {
      throw new RuntimeRequestError(
        "RuntimeNotActive",
        "The settled Pi runtime is no longer active."
      )
    }
    if (revision !== runtime.live?.revision) return
    runtime.snapshot = this.snapshotWithExtensionStatuses(runtime, snapshot)
    runtime.status =
      snapshot.isStreaming || snapshot.isCompacting ? "busy" : "ready"
  }

  private annotateResourceReload(cwd: string, catalog: ResourceCatalog) {
    const pending = [...this.runtimes.values()].some(
      (runtime) =>
        !runtime.cleaned &&
        (runtime.pendingResourceReload || runtime.resourceReloadPromise) &&
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

  private trackPendingExtensionUI(
    runtime: ManagedRuntime,
    requestId: string,
    request: PendingExtensionUIRequest
  ) {
    this.removePendingExtensionUI(runtime, requestId)
    const timeoutMs = "timeout" in request ? request.timeout : undefined
    const expiresAt = timeoutMs ? Date.now() + timeoutMs : null
    const timeout = timeoutMs
      ? setTimeout(
          () => this.removePendingExtensionUI(runtime, requestId),
          timeoutMs
        )
      : null
    timeout?.unref()
    this.extensionUIRequests(runtime).set(requestId, {
      request,
      expiresAt,
      timeout,
    })
    return expiresAt
  }

  private removePendingExtensionUI(runtime: ManagedRuntime, requestId: string) {
    const requests = this.extensionUIRequests(runtime)
    const pending = requests.get(requestId)
    if (!pending) return
    if (pending.timeout) clearTimeout(pending.timeout)
    requests.delete(requestId)
  }

  private extensionUIRequests(runtime: ManagedRuntime) {
    return (runtime.extensionUiRequests ??= new Map())
  }

  private async cleanup(runtime: ManagedRuntime) {
    if (runtime.cleanupPromise) return runtime.cleanupPromise
    runtime.cleanupPromise = (async () => {
      runtime.cleaned = true
      for (const controller of runtime.mcpCalls.values()) controller.abort()
      runtime.mcpCalls.clear()
      for (const requestId of this.extensionUIRequests(runtime).keys()) {
        this.removePendingExtensionUI(runtime, requestId)
      }
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
    const now = Date.now()
    const threshold = now - IDLE_TIMEOUT_MS
    this.recycleRuntimeDrafts(threshold)
    const idle: ManagedRuntime[] = []
    for (const runtime of this.runtimes.values()) {
      this.pruneRuntimeLeases(runtime)
      if (this.isUnclaimedDraftRuntime(runtime)) continue
      if (
        runtime.status !== "ready" ||
        this.runtimeLeaseMap(runtime).size > 0 ||
        this.runtimeHasPendingUserWork(runtime)
      ) {
        continue
      }
      idle.push(runtime)
    }
    const expired = idle.filter((runtime) => runtime.lastActivityAt < threshold)
    const recent = idle
      .filter((runtime) => runtime.lastActivityAt >= threshold)
      .sort((left, right) => left.lastActivityAt - right.lastActivityAt)
    const excess = Math.max(0, recent.length - MAX_IDLE_RUNTIMES)
    const victims = [...expired, ...recent.slice(0, excess)]
    for (const runtime of victims) {
      void this.stop(runtime.webSessionId, "idle-budget").catch((error) => {
        console.error("Could not evict idle Pi runtime:", error)
      })
    }
  }

  private runtimeHasPendingUserWork(runtime: ManagedRuntime) {
    return (
      (runtime.snapshot?.isStreaming ?? false) ||
      (runtime.snapshot?.isCompacting ?? false) ||
      (runtime.snapshot?.queuedPrompts.length ?? 0) > 0 ||
      runtime.pending.size > 0 ||
      (runtime.mcpCalls?.size ?? 0) > 0 ||
      (runtime.extensionUiRequests?.size ?? 0) > 0 ||
      runtime.pendingResourceReload ||
      runtime.pendingModelReload ||
      runtime.pendingMcpRestart ||
      runtime.pendingWebUiRestart ||
      runtime.resourceReloadPromise !== null ||
      runtime.modelReloadPromise !== null ||
      runtime.webUiRestartPromise !== null
    )
  }

  private recycleRuntimeDrafts(threshold: number) {
    const now = Date.now()
    for (const draft of this.runtimeDrafts.values()) {
      this.pruneDraftLeases(draft)
      if (draft.claimPromise) continue
      if (
        draft.claimFailure &&
        draft.claimedAt !== null &&
        draft.leaseExpiries.size === 0 &&
        draft.claimedAt + DRAFT_CLAIM_RECEIPT_TTL_MS <= now
      ) {
        this.runtimeDrafts.delete(draft.draftId)
        continue
      }
      if (!draft.claimResult && !draft.claimFailure && draft.runtime.cleaned) {
        this.runtimeDrafts.delete(draft.draftId)
        void Promise.all([
          rm(draft.runtime.nativeSessionFile, { force: true }),
          rm(draft.draftDirectory, { recursive: true, force: true }),
        ]).catch((error: unknown) => {
          console.error("Could not remove crashed draft session:", error)
        })
        continue
      }
      if (
        draft.claimResult &&
        draft.claimedAt !== null &&
        draft.leaseExpiries.size === 0 &&
        draft.claimedAt + DRAFT_CLAIM_RECEIPT_TTL_MS <= now
      ) {
        this.runtimeDrafts.delete(draft.draftId)
        continue
      }
      if (
        !draft.claimResult &&
        !draft.claimFailure &&
        !draft.claimPromise &&
        draft.leaseExpiries.size === 0 &&
        draft.runtime.status === "ready" &&
        draft.runtime.lastActivityAt < threshold
      ) {
        this.runtimeDrafts.delete(draft.draftId)
        void this.disposeRuntimeDraft(draft).catch((error: unknown) => {
          console.error("Could not stop idle draft runtime:", error)
        })
      }
    }
  }

  private runtimeLeaseMap(runtime: ManagedRuntime) {
    return (runtime.runtimeLeases ??= new Map<string, number>())
  }

  private pruneRuntimeLeases(runtime: ManagedRuntime) {
    const leases = this.runtimeLeaseMap(runtime)
    const now = Date.now()
    for (const [leaseId, expiresAt] of leases) {
      if (expiresAt <= now) leases.delete(leaseId)
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
  const existing = globalThis.piWebCodexRuntimeSupervisor
  if (existing) {
    return RuntimeSupervisor.reuseAfterHotReload(existing)
  }
  const supervisor = new RuntimeSupervisor()
  globalThis.piWebCodexRuntimeSupervisor = supervisor
  return supervisor
}
