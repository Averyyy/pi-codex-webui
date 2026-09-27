import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import type {
  ModelSettingsSnapshot,
  ResourceCatalog,
  RuntimeSnapshot,
  RuntimeStatus,
} from "@workspace/runtime-protocol"

import { EventHub } from "./event-hub"
import {
  RuntimeSupervisor,
  type ModelSettingsRuntimeTarget,
  workerEnvironment,
} from "./runtime-supervisor"

interface FakeRuntime {
  webSessionId: string
  cwd: string
  runtimeProfileId: string
  runtimeKind: "pi" | "pi-client"
  projectId: string | null
  lastActivityAt: number
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
  cleaned: boolean
  pendingResourceReload: boolean
  pendingModelReload: boolean
  pendingMcpRestart: boolean
  pendingWebUiRestart: boolean
  webUiRestartPromise: Promise<void> | null
  pending: Map<string, unknown>
  mcpCalls: Map<string, AbortController>
  runtimeLeases: Map<string, number>
  stopPromise: Promise<void> | null
  resourceReloadPromise: Promise<RuntimeSnapshot> | null
  modelReloadPromise: Promise<RuntimeSnapshot> | null
  extensionUiRequests: Map<string, unknown>
  stopReason?: "explicit" | "idle-budget"
  child: {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
    kill(): boolean
  }
}

interface RuntimeSupervisorInternals {
  runtimes: Map<string, FakeRuntime>
  activations: Map<string, Promise<FakeRuntime>>
  sessionClosures: Map<string, Promise<unknown>>
  activate(sessionId: string): Promise<FakeRuntime>
  request(runtime: FakeRuntime, message: { type: string }): Promise<unknown>
  startRuntime(sessionId: string): Promise<FakeRuntime>
  stop(sessionId: string, reason?: "explicit" | "idle-budget"): Promise<void>
  runSessionClosure<T>(
    sessionIds: string[],
    operation: () => Promise<T>
  ): Promise<T>
  reloadRuntimeModelSettings(runtime: FakeRuntime): Promise<RuntimeSnapshot>
  reloadRuntimeResources(runtime: FakeRuntime): Promise<RuntimeSnapshot>
  reloadModelSettings(): Promise<void>
  recycleIdleRuntimes(): void
  resourceRequest(
    message:
      | {
          type: "models.catalog" | "models.refresh"
          requestId: string
          payload: {
            cwd: string
            agentDir: string
            scope?: "all" | "enabled"
          }
        }
      | {
          type: "resources.set-enabled"
          requestId: string
          payload: {
            cwd: string
            agentDir: string
            resourceId: string
            resourceType: "extension"
            writeScope: "project"
            enabled: boolean
          }
        }
      | {
          type: "resources.catalog"
          requestId: string
          payload: { cwd: string; agentDir: string }
        }
      | {
          type: "providers.remove"
          requestId: string
          payload: { cwd: string; agentDir: string; provider: string }
        },
    timeoutMs?: number,
    runtimeTarget?: ModelSettingsRuntimeTarget,
    onSuccess?: (data: unknown) => unknown | Promise<unknown>
  ): Promise<unknown>
  modelCatalogTargetState(target: ModelSettingsRuntimeTarget): Promise<{
    cwd: string
    agentDir: string
    runtimeProfileId: string
    runtimeKind: "pi" | "pi-client"
    identityKey: string
    catalogIdentity: string
    dataVersion: string
    securityVersion: string
  }>
  knownResourceCatalogIfCurrent(cwd: string): Promise<ResourceCatalog | null>
  resourceQueue: Promise<void>
  modelCatalogWorkersActive: number
  modelCatalogWorkerWaiters: unknown[]
  performResourceRequest(
    message: {
      requestId: string
      type?: string
      payload?: { cwd?: string; agentDir?: string; scope?: string }
    },
    timeoutMs: number,
    runtimeTarget?: ModelSettingsRuntimeTarget,
    metricContext?: unknown,
    lifecycle?: { onSpawn(): void; onClose(): void }
  ): Promise<unknown>
  catalogFenceWaitTimeoutMs: number
  refreshSettledRuntimeSnapshot(runtime: FakeRuntime): Promise<void>
  waitForExit(runtime: FakeRuntime["child"], timeoutMs: number): Promise<void>
}

function snapshot(sessionId: string, leafId: string): RuntimeSnapshot {
  return {
    webSessionId: sessionId,
    nativeSessionId: `native-${sessionId}`,
    nativeSessionFile: `/tmp/${sessionId}.jsonl`,
    leafId,
    cwd: "/tmp",
    model: null,
    availableModels: [],
    thinkingLevel: "off",
    availableThinkingLevels: ["off"],
    activeTools: [],
    isStreaming: false,
    isCompacting: false,
    queuedPrompts: [],
    extensionStatuses: {},
  }
}

function runtime(
  sessionId: string,
  status: RuntimeStatus,
  currentSnapshot: RuntimeSnapshot | null,
  kill: () => boolean = () => true
): FakeRuntime {
  return {
    webSessionId: sessionId,
    cwd: "/tmp",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
    projectId: null,
    lastActivityAt: Date.now(),
    status,
    snapshot: currentSnapshot,
    cleaned: false,
    pendingResourceReload: false,
    pendingModelReload: false,
    pendingMcpRestart: false,
    pendingWebUiRestart: false,
    webUiRestartPromise: null,
    pending: new Map(),
    mcpCalls: new Map(),
    runtimeLeases: new Map(),
    stopPromise: null,
    resourceReloadPromise: null,
    modelReloadPromise: null,
    extensionUiRequests: new Map(),
    child: { exitCode: null, signalCode: null, kill },
  }
}

function internals(supervisor: RuntimeSupervisor) {
  return supervisor as unknown as RuntimeSupervisorInternals
}

function modelSettingsSnapshot(ids: string[] = []): ModelSettingsSnapshot {
  return {
    models: ids.map((id) => ({
      provider: "fixture",
      id,
      name: id,
      reasoning: false,
      input: ["text"],
      contextWindow: 16_000,
      maxTokens: 2_000,
      enabled: true,
      availableThinkingLevels: ["off"],
      defaultThinkingLevel: "off",
    })),
    providers: [],
    enabledModels: null,
    defaultModel: null,
  }
}

function stubModelCatalogTargetState(
  state: RuntimeSupervisorInternals,
  version: () => string = () => "version-1"
) {
  state.modelCatalogTargetState = async (target) => ({
    cwd: `C:\\fixture\\${target.runtimeProfileId}`,
    agentDir: "C:\\fixture\\agent",
    runtimeProfileId: target.runtimeProfileId,
    runtimeKind: target.runtimeKind,
    identityKey: JSON.stringify([
      target.runtimeProfileId,
      target.runtimeKind,
      `C:\\fixture\\${target.runtimeProfileId}`,
    ]),
    catalogIdentity: `catalog-${target.runtimeProfileId}`,
    dataVersion: version(),
    securityVersion: `security-${version()}`,
  })
}

test("model catalog refresh updates cached data without reloading runtimes", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const calls: string[] = []
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  stubModelCatalogTargetState(state)
  state.performResourceRequest = async (message) => {
    calls.push(`${message.type}:${message.payload?.scope ?? ""}`)
    return modelSettingsSnapshot(["old-model"])
  }
  state.resourceRequest = async (message) => {
    calls.push(message.type)
    return modelSettingsSnapshot(["new-model"])
  }
  state.reloadModelSettings = async () => {
    throw new Error("Catalog refresh must not apply to active runtimes.")
  }

  const initial = await supervisor.modelSettings(target)
  const refreshed = await supervisor.refreshModelSettings(target)
  const cached = await supervisor.modelSettings(target)

  assert.deepEqual(
    initial.models.map(({ id }) => id),
    ["old-model"]
  )
  assert.deepEqual(
    refreshed.models.map(({ id }) => id),
    ["new-model"]
  )
  assert.deepEqual(
    cached.models.map(({ id }) => id),
    ["new-model"]
  )
  assert.notEqual(refreshed.catalogVersion, initial.catalogVersion)
  assert.deepEqual(calls, ["models.catalog:all", "models.refresh"])
})

test("failed catalog refresh retains the last usable snapshot", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  stubModelCatalogTargetState(state)
  state.performResourceRequest = async () =>
    modelSettingsSnapshot(["old-model"])
  state.resourceRequest = async () => ({
    ...modelSettingsSnapshot(["partial-model"]),
    refreshErrors: [{ provider: "fixture", message: "refresh failed" }],
  })
  const initial = await supervisor.modelSettings(target)
  const failed = await supervisor.refreshModelSettings(target)
  const cached = await supervisor.modelSettings(target)

  assert.deepEqual(
    failed.models.map(({ id }) => id),
    ["old-model"]
  )
  assert.deepEqual(
    cached.models.map(({ id }) => id),
    ["old-model"]
  )
  assert.deepEqual(failed.refreshErrors, [
    { provider: "fixture", message: "refresh failed" },
  ])
  assert.equal(failed.catalogVersion, initial.catalogVersion)
})

test("catalog GETs keep serving the cached snapshot during explicit refresh", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  stubModelCatalogTargetState(state)
  let refreshStarted!: () => void
  const started = new Promise<void>((resolve) => {
    refreshStarted = resolve
  })
  const refreshGate = { release: () => {} }
  const refreshResult = new Promise<void>((resolve) => {
    refreshGate.release = resolve
  })
  state.performResourceRequest = async (message) => {
    if (message.type === "models.refresh") {
      refreshStarted()
      await refreshResult
      return modelSettingsSnapshot(["new-model"])
    }
    return modelSettingsSnapshot(["old-model"])
  }
  await supervisor.modelSettings(target, "all")
  const refresh = supervisor.refreshModelSettings(target)
  await started
  const duringRefresh = await supervisor.modelSettings(target, "all")
  assert.deepEqual(
    duringRefresh.models.map(({ id }) => id),
    ["old-model"]
  )
  refreshGate.release()
  const refreshed = await refresh
  assert.deepEqual(
    refreshed.models.map(({ id }) => id),
    ["new-model"]
  )
})

test("model config changes during refresh invalidate the old snapshot with a concurrent GET", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  let version = "auth-v1"
  stubModelCatalogTargetState(state, () => version)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  let refreshStarted!: () => void
  const started = new Promise<void>((resolve) => {
    refreshStarted = resolve
  })
  const refreshGate = { release: () => {} }
  const refreshResult = new Promise<void>((resolve) => {
    refreshGate.release = resolve
  })
  let catalogCalls = 0
  state.performResourceRequest = async (message) => {
    if (message.type === "models.refresh") {
      refreshStarted()
      await refreshResult
      return modelSettingsSnapshot(["stale-refreshed-model"])
    }
    catalogCalls += 1
    return modelSettingsSnapshot(["fresh-auth-model"])
  }
  await supervisor.modelSettings(target, "all")
  catalogCalls = 0
  const refreshFailure = supervisor
    .refreshModelSettings(target)
    .catch((error: unknown) => error)
  await started
  version = "auth-v2"
  let readFinished = false
  const freshRead = supervisor.modelSettings(target, "all").then((settings) => {
    readFinished = true
    return settings
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(readFinished, false)
  refreshGate.release()
  const [refreshError, settings] = await Promise.all([
    refreshFailure,
    freshRead,
  ])
  assert.equal((refreshError as { code?: string }).code, "ModelCatalogChanged")
  assert.deepEqual(
    settings.models.map(({ id }) => id),
    ["fresh-auth-model"]
  )
  assert.equal(catalogCalls, 1)
})

test("refresh cannot return a stale model config snapshot after a credential change without GET", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  let version = "auth-v1"
  stubModelCatalogTargetState(state, () => version)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  let refreshStarted!: () => void
  const started = new Promise<void>((resolve) => {
    refreshStarted = resolve
  })
  const refreshGate = { release: () => {} }
  const refreshResult = new Promise<void>((resolve) => {
    refreshGate.release = resolve
  })
  state.performResourceRequest = async (message) => {
    if (message.type === "models.refresh") {
      refreshStarted()
      await refreshResult
      return modelSettingsSnapshot(["stale-refreshed-model"])
    }
    return modelSettingsSnapshot(
      version === "auth-v1" ? ["old-auth-model"] : ["fresh-auth-model"]
    )
  }
  await supervisor.modelSettings(target, "all")
  const refreshFailure = supervisor
    .refreshModelSettings(target)
    .catch((error: unknown) => error)
  await started
  version = "auth-v2"
  refreshGate.release()

  const error = await refreshFailure
  assert.equal((error as { code?: string }).code, "ModelCatalogChanged")
  const settings = await supervisor.modelSettings(target, "all")
  assert.deepEqual(
    settings.models.map(({ id }) => id),
    ["fresh-auth-model"]
  )
})

test("model mutations carry the selected runtime target", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi-client-default",
    runtimeKind: "pi-client",
  }
  stubModelCatalogTargetState(state)
  const reads: string[] = []
  const requests: {
    type: string
    runtimeTarget: ModelSettingsRuntimeTarget | undefined
  }[] = []
  const reloads: boolean[] = []
  const settings = modelSettingsSnapshot(["fixture-model"])
  state.performResourceRequest = async (message) => {
    reads.push(`${message.type}:${message.payload?.scope ?? ""}`)
    return settings
  }
  state.resourceRequest = async (
    message,
    _timeoutMs,
    runtimeTarget,
    onSuccess
  ) => {
    requests.push({ type: message.type, runtimeTarget })
    return onSuccess ? onSuccess(settings) : settings
  }
  state.reloadModelSettings = async () => {
    reloads.push(true)
  }

  await supervisor.modelSettings(target, "enabled")
  await supervisor.refreshModelSettings(target)
  await supervisor.setModelScope(target, null, [])
  await supervisor.saveCustomProvider(target, {
    provider: "fixture",
    api: "openai-completions",
    baseUrl: "https://example.test/v1",
    models: [
      {
        id: "fixture-model",
        name: "Fixture model",
        reasoning: false,
        input: ["text"],
        contextWindow: 16_000,
        maxTokens: 2_000,
      },
    ],
  })
  await supervisor.removeProvider(target, "fixture")

  assert.deepEqual(
    requests.map(({ type }) => type),
    ["models.refresh", "models.set-scope", "providers.save", "providers.remove"]
  )
  assert.equal(
    requests.every(
      ({ runtimeTarget }) =>
        runtimeTarget?.cwd === target.cwd &&
        runtimeTarget.runtimeProfileId === target.runtimeProfileId &&
        runtimeTarget.runtimeKind === target.runtimeKind
    ),
    true
  )
  assert.deepEqual(reads, ["models.catalog:enabled", "models.catalog:all"])
  assert.equal(reloads.length, 3)
})

test("shared model provider changes reload ready runtimes of both kinds", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  stubModelCatalogTargetState(state)
  const piRuntime = runtime(
    "pi-session",
    "ready",
    snapshot("pi-session", "before")
  )
  const clientRuntime = runtime(
    "client-session",
    "ready",
    snapshot("client-session", "before")
  )
  clientRuntime.runtimeKind = "pi-client"
  clientRuntime.runtimeProfileId = "pi-client-default"
  state.runtimes.set(piRuntime.webSessionId, piRuntime)
  state.runtimes.set(clientRuntime.webSessionId, clientRuntime)
  const reloaded: string[] = []
  state.performResourceRequest = async () =>
    modelSettingsSnapshot(["new-model"])
  state.reloadRuntimeModelSettings = async (managed) => {
    reloaded.push(managed.webSessionId)
    return managed.snapshot!
  }

  await supervisor.saveCustomProvider(
    {
      cwd: "/workspace/client",
      runtimeProfileId: "pi-client-default",
      runtimeKind: "pi-client",
    },
    {
      provider: "fixture",
      api: "openai-completions",
      baseUrl: "https://example.test/v1",
      models: [
        {
          id: "fixture-model",
          name: "Fixture model",
          reasoning: false,
          input: ["text"],
          contextWindow: 16_000,
          maxTokens: 2_000,
        },
      ],
    }
  )

  assert.deepEqual(reloaded.sort(), ["client-session", "pi-session"])
})

test("same-scope cold model reads share one worker and cache version", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  stubModelCatalogTargetState(state)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  let releaseWorker!: () => void
  let calls = 0
  state.performResourceRequest = async () => {
    calls += 1
    await new Promise<void>((resolve) => {
      releaseWorker = resolve
    })
    return modelSettingsSnapshot(["model-a"])
  }

  const first = supervisor.modelSettings(target, "enabled")
  const second = supervisor.modelSettings(target, "enabled")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 1)
  releaseWorker()
  const [left, right] = await Promise.all([first, second])
  assert.deepEqual(
    left.models.map(({ id }) => id),
    ["model-a"]
  )
  assert.equal(left.catalogIdentity, right.catalogIdentity)
  assert.equal(left.catalogVersion, right.catalogVersion)
  assert.equal(
    (await supervisor.modelSettings(target, "enabled")).catalogVersion,
    left.catalogVersion
  )
  assert.equal(calls, 1)
})

test("cold model catalog workers are bounded across distinct targets", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  stubModelCatalogTargetState(state)
  let active = 0
  let maximum = 0
  let calls = 0
  state.performResourceRequest = async () => {
    calls += 1
    active += 1
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, 10))
    active -= 1
    return modelSettingsSnapshot(["model-a"])
  }
  const targets = Array.from({ length: 7 }, (_, index) => ({
    cwd: `/workspace/${index}`,
    runtimeProfileId: `profile-${index}`,
    runtimeKind: "pi-client" as const,
  }))
  await Promise.all(
    targets.map((target) => supervisor.modelSettings(target, "enabled"))
  )
  assert.equal(calls, targets.length)
  assert.equal(maximum, 4)
})

test("model catalog cold-read backpressure bounds pending identities", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  stubModelCatalogTargetState(state)
  let active = 0
  let maximum = 0
  let releaseWorkers!: () => void
  const workerGate = new Promise<void>((resolve) => {
    releaseWorkers = resolve
  })
  state.performResourceRequest = async () => {
    active += 1
    maximum = Math.max(maximum, active)
    await workerGate
    active -= 1
    return modelSettingsSnapshot(["model-a"])
  }
  const targets = Array.from({ length: 40 }, (_, index) => ({
    cwd: `/workspace/${index}`,
    runtimeProfileId: `overflow-${index}`,
    runtimeKind: "pi-client" as const,
  }))
  const pending = targets.map((target) =>
    supervisor.modelSettings(target, "enabled")
  )
  const resultsPromise = Promise.allSettled(pending)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(state.modelCatalogWorkersActive, 4)
  assert.equal(state.modelCatalogWorkerWaiters.length, 32)
  assert.equal(maximum, 4)
  assert.throws(() => supervisor.assertUpdateIdle(), { code: "RuntimeBusy" })
  releaseWorkers()
  const results = await resultsPromise
  assert.equal(
    results.filter(
      (result) =>
        result.status === "rejected" &&
        (result.reason as { code?: string }).code === "ModelCatalogBusy"
    ).length,
    4
  )
  assert.equal(state.modelCatalogWorkersActive, 0)
  assert.equal(state.modelCatalogWorkerWaiters.length, 0)
})

test("catalog worker slots remain leased until a failed child closes", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  stubModelCatalogTargetState(state)
  const targets = Array.from({ length: 5 }, (_, index) => ({
    cwd: `/workspace/lease-${index}`,
    runtimeProfileId: `lease-${index}`,
    runtimeKind: "pi-client" as const,
  }))
  let calls = 0
  let closeFailedChild!: () => void
  const closeHealthyChildren: Array<() => void> = []
  state.performResourceRequest = async (
    _message,
    _timeoutMs,
    _runtimeTarget,
    _metricContext,
    lifecycle
  ) => {
    calls += 1
    lifecycle?.onSpawn()
    if (calls === 1) {
      closeFailedChild = () => lifecycle?.onClose()
      throw new Error("simulated stop timeout")
    }
    return new Promise<ModelSettingsSnapshot>((resolve) => {
      closeHealthyChildren.push(() => {
        lifecycle?.onClose()
        resolve(modelSettingsSnapshot(["model-a"]))
      })
    })
  }

  const firstFailure = await supervisor
    .modelSettings(targets[0]!)
    .catch((error: unknown) => error)
  assert.match((firstFailure as Error).message, /simulated stop timeout/)
  assert.equal(state.modelCatalogWorkersActive, 1)

  const remaining = targets
    .slice(1)
    .map((target) => supervisor.modelSettings(target))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 4)
  assert.equal(state.modelCatalogWorkersActive, 4)
  assert.equal(state.modelCatalogWorkerWaiters.length, 1)

  closeFailedChild()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 5)
  assert.equal(state.modelCatalogWorkersActive, 4)
  assert.equal(state.modelCatalogWorkerWaiters.length, 0)

  for (const close of closeHealthyChildren) close()
  await Promise.all(remaining)
  assert.equal(state.modelCatalogWorkersActive, 0)
})

test("resource writes wait for failed catalog readers to close and retry explicitly", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  state.catalogFenceWaitTimeoutMs = 10
  stubModelCatalogTargetState(state)
  const piTarget: ModelSettingsRuntimeTarget = {
    cwd: "/workspace/pi",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  const clientTarget: ModelSettingsRuntimeTarget = {
    cwd: "/workspace/client",
    runtimeProfileId: "pi-client-default",
    runtimeKind: "pi-client",
  }
  let closeFailedReader!: () => void
  let writesStarted = 0
  state.performResourceRequest = async (
    message,
    _timeoutMs,
    _runtimeTarget,
    _metricContext,
    lifecycle
  ) => {
    lifecycle?.onSpawn()
    if (message.type === "models.catalog") {
      closeFailedReader = () => lifecycle?.onClose()
      throw new Error("simulated catalog stop timeout")
    }
    writesStarted += 1
    lifecycle?.onClose()
    return {}
  }
  const readerError = await supervisor
    .modelSettings(piTarget)
    .catch((error: unknown) => error)
  assert.match((readerError as Error).message, /catalog stop timeout/)
  assert.equal(state.modelCatalogWorkersActive, 1)

  const makeWrite = () =>
    state.resourceRequest(
      {
        type: "providers.remove",
        requestId: `client-provider-${writesStarted}`,
        payload: {
          cwd: "C:\\fixture\\pi-client-default",
          agentDir: "C:\\fixture\\agent",
          provider: "fixture",
        },
      },
      undefined,
      clientTarget
    )
  const blocked = await makeWrite().catch((error: unknown) => error)
  assert.equal((blocked as { code?: string }).code, "ModelCatalogBusy")
  assert.equal(writesStarted, 0)
  closeFailedReader()
  assert.equal(state.modelCatalogWorkersActive, 0)

  await makeWrite()
  assert.equal(writesStarted, 1)
})

test("shared mutations remain fenced after a failed worker until close", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  state.catalogFenceWaitTimeoutMs = 10
  stubModelCatalogTargetState(state)
  const clientTarget: ModelSettingsRuntimeTarget = {
    cwd: "/workspace/client",
    runtimeProfileId: "pi-client-default",
    runtimeKind: "pi-client",
  }
  const piTarget: ModelSettingsRuntimeTarget = {
    cwd: "/workspace/pi",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  let closeFailedMutation!: () => void
  let writesStarted = 0
  state.performResourceRequest = async (
    _message,
    _timeoutMs,
    _runtimeTarget,
    _metricContext,
    lifecycle
  ) => {
    writesStarted += 1
    lifecycle?.onSpawn()
    if (writesStarted === 1) {
      closeFailedMutation = () => lifecycle?.onClose()
      throw new Error("simulated provider mutation stop timeout")
    }
    lifecycle?.onClose()
    return {}
  }
  const makeWrite = (target: ModelSettingsRuntimeTarget, requestId: string) =>
    state.resourceRequest(
      {
        type: "providers.remove",
        requestId,
        payload: {
          cwd: `C:\\fixture\\${target.runtimeProfileId}`,
          agentDir: "C:\\fixture\\agent",
          provider: "fixture",
        },
      },
      undefined,
      target
    )

  const failed = await makeWrite(clientTarget, "failed-provider-write").catch(
    (error: unknown) => error
  )
  assert.match((failed as Error).message, /provider mutation stop timeout/)
  const blocked = await makeWrite(piTarget, "blocked-provider-write").catch(
    (error: unknown) => error
  )
  assert.equal((blocked as { code?: string }).code, "ModelCatalogBusy")
  assert.equal(writesStarted, 1)

  closeFailedMutation()
  await makeWrite(piTarget, "retried-provider-write")
  assert.equal(writesStarted, 2)
})

test("an unrelated slow resource write does not block a model catalog read", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  stubModelCatalogTargetState(state)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace/target",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  const writeStartedSignal = { resolve: () => {} }
  const writeGate = { release: () => {} }
  const writeHasStarted = new Promise<void>((resolve) => {
    writeStartedSignal.resolve = resolve
  })
  const writeGatePromise = new Promise<void>((resolve) => {
    writeGate.release = resolve
  })
  let modelStarted = false
  state.performResourceRequest = async (message) => {
    if (message.type === "resources.set-enabled") {
      writeStartedSignal.resolve()
      await writeGatePromise
      return {}
    }
    modelStarted = true
    return modelSettingsSnapshot(["model-a"])
  }
  const write = state.resourceRequest({
    type: "resources.set-enabled",
    requestId: "unrelated-project-write",
    payload: {
      cwd: "C:\\fixture\\other-project",
      agentDir: "C:\\fixture\\agent",
      resourceId: "fixture-extension",
      resourceType: "extension",
      writeScope: "project",
      enabled: true,
    },
  })
  await writeHasStarted
  const settings = await supervisor.modelSettings(target, "enabled")
  assert.equal(modelStarted, true)
  assert.deepEqual(
    settings.models.map(({ id }) => id),
    ["model-a"]
  )
  writeGate.release()
  await write
})

test("a relevant write waits for a cold catalog read and invalidates its snapshot", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  let version = "settings-v1"
  stubModelCatalogTargetState(state, () => version)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  let releaseRead!: () => void
  let catalogCalls = 0
  let writeStarted = false
  state.performResourceRequest = async (message) => {
    if (message.type === "resources.set-enabled") {
      writeStarted = true
      version = "settings-v2"
      return {}
    }
    catalogCalls += 1
    if (catalogCalls === 1) {
      await new Promise<void>((resolve) => {
        releaseRead = resolve
      })
      return modelSettingsSnapshot(["before-write"])
    }
    return modelSettingsSnapshot(["after-write"])
  }

  const firstRead = supervisor.modelSettings(target)
  await new Promise((resolve) => setImmediate(resolve))
  assert.throws(() => supervisor.assertUpdateIdle(), { code: "RuntimeBusy" })
  const write = state.resourceRequest({
    type: "resources.set-enabled",
    requestId: "same-project-write",
    payload: {
      cwd: "C:\\fixture\\pi",
      agentDir: "C:\\fixture\\agent",
      resourceId: "fixture-extension",
      resourceType: "extension",
      writeScope: "project",
      enabled: false,
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(writeStarted, false)
  releaseRead()
  const before = await firstRead
  await write
  const after = await supervisor.modelSettings(target)

  assert.deepEqual(
    before.models.map(({ id }) => id),
    ["before-write"]
  )
  assert.deepEqual(
    after.models.map(({ id }) => id),
    ["after-write"]
  )
  assert.equal(catalogCalls, 2)
  assert.equal(writeStarted, true)
})

test("provider writes fence and invalidate catalogs across runtime profiles", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  stubModelCatalogTargetState(state)
  const piTarget: ModelSettingsRuntimeTarget = {
    cwd: "/workspace/pi",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  const clientTarget: ModelSettingsRuntimeTarget = {
    cwd: "/workspace/client",
    runtimeProfileId: "pi-client-default",
    runtimeKind: "pi-client",
  }
  let releaseRead!: () => void
  let readCount = 0
  let mutationStarted = false
  state.performResourceRequest = async (message) => {
    if (message.type === "models.catalog") {
      readCount += 1
      if (readCount === 1) {
        await new Promise<void>((resolve) => {
          releaseRead = resolve
        })
      }
      return modelSettingsSnapshot([`pi-read-${readCount}`])
    }
    if (message.type === "providers.remove") mutationStarted = true
    return {}
  }

  const read = supervisor.modelSettings(piTarget)
  await new Promise((resolve) => setImmediate(resolve))
  const write = state.resourceRequest(
    {
      type: "providers.remove",
      requestId: "client-provider-write",
      payload: {
        cwd: "C:\\fixture\\pi-client-default",
        agentDir: "C:\\fixture\\agent",
        provider: "fixture",
      },
    },
    undefined,
    clientTarget
  )
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(mutationStarted, false)
  releaseRead()
  await Promise.all([read, write])
  assert.equal(mutationStarted, true)

  const afterWrite = await supervisor.modelSettings(piTarget)
  assert.deepEqual(
    afterWrite.models.map(({ id }) => id),
    ["pi-read-2"]
  )
  assert.equal(readCount, 2)
})

test("a model catalog read in flight cannot publish after its auth version changes", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  let version = "auth-v1"
  stubModelCatalogTargetState(state, () => version)
  const target: ModelSettingsRuntimeTarget = {
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  }
  let releaseFirst!: () => void
  let calls = 0
  state.performResourceRequest = async () => {
    calls += 1
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      return modelSettingsSnapshot(["stale-model"])
    }
    return modelSettingsSnapshot(["current-model"])
  }
  const request = supervisor.modelSettings(target)
  await new Promise((resolve) => setImmediate(resolve))
  version = "auth-v2"
  releaseFirst()
  const settings = await request
  assert.deepEqual(
    settings.models.map(({ id }) => id),
    ["current-model"]
  )
  assert.equal(calls, 2)
})

test("selecting a refreshed model applies it to the same idle worker", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const availableModel = {
    provider: "fixture",
    id: "new-model",
    name: "New model",
    reasoning: false,
    input: ["text"] as const,
    contextWindow: 16_000,
    maxTokens: 2_000,
  }
  const before = snapshot("session-catalog-apply", "before-apply")
  const managed = runtime("session-catalog-apply", "ready", before)
  let stops = 0
  managed.child.kill = () => {
    stops += 1
    return true
  }
  state.runtimes.set(managed.webSessionId, managed)
  state.activate = async () => managed
  const requests: string[] = []
  const refreshedSnapshot = {
    ...before,
    availableModels: [availableModel],
  }
  const selectedSnapshot = {
    ...refreshedSnapshot,
    model: availableModel,
  }
  state.request = async (_runtime, message) => {
    requests.push(message.type)
    if (message.type === "runtime.reload-model-settings") {
      return refreshedSnapshot
    }
    assert.equal(message.type, "session.set-model")
    return selectedSnapshot
  }

  const selected = await supervisor.setModel(
    managed.webSessionId,
    "fixture",
    "new-model"
  )
  assert.deepEqual(requests, [
    "runtime.reload-model-settings",
    "session.set-model",
  ])
  assert.equal(selected.model?.id, "new-model")
  assert.equal(managed.child.exitCode, null)
  assert.equal(stops, 0)
})

test("resource catalog retries when trust changes during the worker read", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-resource-trust-fence-"))
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR
  const cwd = path.join(root, "project")
  const agentDir = path.join(root, "agent")
  const trustPath = path.join(agentDir, "trust.json")
  await mkdir(path.join(cwd, ".pi", "extensions"), { recursive: true })
  await mkdir(agentDir, { recursive: true })
  process.env.PI_CODING_AGENT_DIR = agentDir
  try {
    await writeFile(trustPath, JSON.stringify({ [cwd]: true }))
    const supervisor = new RuntimeSupervisor(new EventHub())
    const state = internals(supervisor)
    let calls = 0
    state.resourceRequest = async (message) => {
      assert.equal(message.type, "resources.catalog")
      calls += 1
      if (calls === 1) {
        await writeFile(trustPath, JSON.stringify({ [cwd]: false }))
        return {
          cwd,
          projectTrusted: true,
          trustRequired: true,
          resources: [],
          packages: [],
        }
      }
      return {
        cwd,
        projectTrusted: false,
        trustRequired: true,
        resources: [],
        packages: [],
      }
    }

    const catalog = await supervisor.resourceCatalog(cwd)
    assert.equal(catalog.projectTrusted, false)
    assert.equal(calls, 2)
    const current = await supervisor.knownResourceCatalogIfCurrent(cwd)
    assert.equal(current?.projectTrusted, false)
    assert.equal(calls, 2)

    await writeFile(trustPath, JSON.stringify({ [cwd]: true }))
    assert.equal(await supervisor.knownResourceCatalogIfCurrent(cwd), null)
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir
    await rm(root, { recursive: true, force: true })
  }
})

test("model selection fails explicitly when the active runtime still lacks it", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime(
    "session-missing-model",
    "ready",
    snapshot("session-missing-model", "before-apply")
  )
  state.runtimes.set(managed.webSessionId, managed)
  state.activate = async () => managed
  const requests: string[] = []
  state.request = async (_runtime, message) => {
    requests.push(message.type)
    return managed.snapshot
  }

  await assert.rejects(
    supervisor.setModel(managed.webSessionId, "fixture", "missing-model"),
    { code: "ModelNotAvailable" }
  )
  assert.deepEqual(requests, ["runtime.reload-model-settings"])
  assert.equal(managed.child.exitCode, null)
})

test("model worker environment preserves the selected Pi Server credentials", () => {
  const original = {
    PI_SERVER_MODE: process.env.PI_SERVER_MODE,
    PI_SERVER_URL: process.env.PI_SERVER_URL,
    PI_SERVER_AUTH_TOKEN: process.env.PI_SERVER_AUTH_TOKEN,
    PI_WEB_CODEX_UPDATE_CONTROL_URL:
      process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL,
    PI_WEB_CODEX_UPDATE_CONTROL_TOKEN:
      process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN,
    PI_WEB_CODEX_UPDATE_OPERATION_ID:
      process.env.PI_WEB_CODEX_UPDATE_OPERATION_ID,
    PI_WEB_CODEX_UPDATE_VERIFYING: process.env.PI_WEB_CODEX_UPDATE_VERIFYING,
    PI_WEB_CODEX_MUTATION_TOKEN: process.env.PI_WEB_CODEX_MUTATION_TOKEN,
  }
  process.env.PI_SERVER_MODE = "stale"
  process.env.PI_SERVER_URL = "http://stale.invalid"
  process.env.PI_SERVER_AUTH_TOKEN = "stale-token"
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_URL = "http://127.0.0.1:1234"
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = "update-secret"
  process.env.PI_WEB_CODEX_UPDATE_OPERATION_ID = "operation-id"
  process.env.PI_WEB_CODEX_UPDATE_VERIFYING = "1"
  process.env.PI_WEB_CODEX_MUTATION_TOKEN = "mutation-secret"
  try {
    const clientEnvironment = workerEnvironment(
      {
        kind: "pi-client",
        serverUrl: "http://127.0.0.1:4217",
        authToken: "fixture-token",
      },
      "/fixture-agent"
    )
    assert.equal(clientEnvironment.PI_CODING_AGENT_DIR, "/fixture-agent")
    assert.equal(clientEnvironment.PI_SERVER_MODE, "true")
    assert.equal(clientEnvironment.PI_SERVER_URL, "http://127.0.0.1:4217")
    assert.equal(clientEnvironment.PI_SERVER_AUTH_TOKEN, "fixture-token")
    for (const key of [
      "PI_WEB_CODEX_UPDATE_CONTROL_URL",
      "PI_WEB_CODEX_UPDATE_CONTROL_TOKEN",
      "PI_WEB_CODEX_UPDATE_OPERATION_ID",
      "PI_WEB_CODEX_UPDATE_VERIFYING",
      "PI_WEB_CODEX_MUTATION_TOKEN",
    ]) {
      assert.equal(clientEnvironment[key], undefined, key)
    }

    const piEnvironment = workerEnvironment({ kind: "pi" }, "/fixture-agent")
    assert.equal(piEnvironment.PI_CODING_AGENT_DIR, "/fixture-agent")
    assert.equal(piEnvironment.PI_SERVER_MODE, undefined)
    assert.equal(piEnvironment.PI_SERVER_URL, undefined)
    assert.equal(piEnvironment.PI_SERVER_AUTH_TOKEN, undefined)
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("update busy checks do not stop a non-ready worker", () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  let kills = 0
  state.runtimes.set("busy-session", {
    ...runtime("busy-session", "busy", snapshot("busy-session", "leaf"), () => {
      kills += 1
      return true
    }),
    mcpCalls: new Map(),
    pendingMcpRestart: false,
    pendingWebUiRestart: false,
    webUiRestartPromise: null,
    extensionUiRequests: new Map(),
  } as never)

  assert.throws(
    () => supervisor.assertUpdateIdle(),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "RuntimeBusy"
  )
  assert.equal(kills, 0)
})

test("idle runtime budget trims least-recently-used workers and protects live work", () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const now = Date.now()
  const stopped: Array<{ sessionId: string; reason?: string }> = []
  state.stop = async (sessionId, reason) => {
    stopped.push({ sessionId, reason })
  }

  for (let index = 0; index < 10; index += 1) {
    const managed = runtime(
      `idle-${index}`,
      "ready",
      snapshot(`idle-${index}`, "leaf")
    )
    managed.lastActivityAt = now - (index + 1) * 1_000
    state.runtimes.set(managed.webSessionId, managed)
  }
  const expired = runtime(
    "expired-idle",
    "ready",
    snapshot("expired-idle", "leaf")
  )
  expired.lastActivityAt = now - 16 * 60_000
  state.runtimes.set(expired.webSessionId, expired)

  const leased = runtime("leased", "ready", snapshot("leased", "leaf"))
  leased.lastActivityAt = now - 30 * 60_000
  leased.runtimeLeases.set("visible-view", now + 60_000)
  state.runtimes.set(leased.webSessionId, leased)

  const busy = runtime("busy", "busy", snapshot("busy", "leaf"))
  busy.lastActivityAt = now - 30 * 60_000
  state.runtimes.set(busy.webSessionId, busy)

  const pending = runtime("pending", "ready", snapshot("pending", "leaf"))
  pending.lastActivityAt = now - 30 * 60_000
  pending.pending.set("request", {})
  state.runtimes.set(pending.webSessionId, pending)

  const mcp = runtime("mcp", "ready", snapshot("mcp", "leaf"))
  mcp.lastActivityAt = now - 30 * 60_000
  mcp.mcpCalls.set("call", new AbortController())
  state.runtimes.set(mcp.webSessionId, mcp)

  state.recycleIdleRuntimes()
  assert.deepEqual(stopped.map(({ sessionId }) => sessionId).sort(), [
    "expired-idle",
    "idle-8",
    "idle-9",
  ])
  assert.equal(
    stopped.every(({ reason }) => reason === "idle-budget"),
    true
  )
})

test("update runtime drain waits for every worker before reporting a failure", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const stopped: string[] = []
  state.stop = async (sessionId: string) => {
    await new Promise((resolve) =>
      setTimeout(resolve, sessionId === "first" ? 5 : 15)
    )
    stopped.push(sessionId)
    if (sessionId === "first") throw new Error("first stop failed")
  }
  for (const sessionId of ["first", "second"]) {
    state.runtimes.set(sessionId, {
      ...runtime(sessionId, "ready", snapshot(sessionId, "leaf")),
      mcpCalls: new Map(),
      pendingMcpRestart: false,
      pendingWebUiRestart: false,
      webUiRestartPromise: null,
      extensionUiRequests: new Map(),
    } as never)
  }

  await assert.rejects(() => supervisor.drainForUpdate(), /first stop failed/)
  assert.deepEqual(stopped.sort(), ["first", "second"])
})

test("activate waits for the registered activation instead of returning its starting runtime", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime("session-a", "starting", null)
  let finish!: (value: FakeRuntime) => void
  const activation = new Promise<FakeRuntime>((resolve) => {
    finish = resolve
  })
  state.runtimes.set(managed.webSessionId, managed)
  state.activations.set(managed.webSessionId, activation)

  let resolved = false
  const result = supervisor.activate(managed.webSessionId).then((value) => {
    resolved = true
    return value
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(resolved, false)

  managed.status = "ready"
  managed.snapshot = snapshot(managed.webSessionId, "leaf-ready")
  finish(managed)
  assert.equal(await result, managed)
})

test("activate rejects an orphaned starting runtime without a completed snapshot", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime("session-b", "starting", null)
  state.runtimes.set(managed.webSessionId, managed)

  await assert.rejects(
    supervisor.activate(managed.webSessionId),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "RuntimeBusy"
  )
})

test("a failed resource reload clears pending state and terminates the uncertain runtime", async () => {
  const events = new EventHub()
  const supervisor = new RuntimeSupervisor(events)
  const state = internals(supervisor)
  const previous = snapshot("session-c", "leaf-before-reload")
  let kills = 0
  const managed = runtime("session-c", "ready", previous, () => {
    kills += 1
    return true
  })
  state.runtimes.set(managed.webSessionId, managed)
  state.request = async () => {
    throw new Error("reload failed")
  }

  await assert.rejects(state.reloadRuntimeResources(managed), /reload failed/)
  assert.equal(managed.pendingResourceReload, false)
  assert.equal(managed.status, "crashed")
  assert.equal(managed.snapshot, previous)
  assert.equal(kills, 1)
  assert.deepEqual(
    events.recent(managed.webSessionId).map((event) => event.type),
    ["runtime.starting"]
  )
})

test("settled runtime refresh replaces the stale leaf snapshot", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime(
    "session-d",
    "ready",
    snapshot("session-d", "settings-entry")
  )
  const settled = snapshot("session-d", "assistant-entry")
  state.runtimes.set(managed.webSessionId, managed)
  state.request = async (_runtime, message) => {
    assert.equal(message.type, "session.snapshot")
    return settled
  }

  await state.refreshSettledRuntimeSnapshot(managed)
  assert.deepEqual(managed.snapshot, settled)
  assert.equal(managed.snapshot?.leafId, "assistant-entry")
  assert.equal(managed.status, "ready")
})

test("concurrent stop requests share one runtime shutdown", async () => {
  const events = new EventHub()
  const supervisor = new RuntimeSupervisor(events)
  const state = internals(supervisor)
  const managed = runtime(
    "session-e",
    "ready",
    snapshot("session-e", "assistant-entry")
  )
  state.runtimes.set(managed.webSessionId, managed)
  let shutdownRequests = 0
  let finishShutdown!: () => void
  const shutdown = new Promise<void>((resolve) => {
    finishShutdown = resolve
  })
  state.request = async (_runtime, message) => {
    assert.equal(message.type, "runtime.shutdown")
    shutdownRequests += 1
    await shutdown
  }
  state.waitForExit = async () => {}

  const first = supervisor.stop(managed.webSessionId)
  const second = supervisor.stop(managed.webSessionId)
  assert.equal(shutdownRequests, 1)
  assert.equal(managed.status, "stopping")
  assert.equal(
    events
      .recent(managed.webSessionId)
      .filter((event) => event.type === "runtime.stopping").length,
    1
  )

  finishShutdown()
  await Promise.all([first, second])
  assert.equal(managed.stopPromise, null)
})

test("stop waits for an in-flight activation before shutting down", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime(
    "session-f",
    "ready",
    snapshot("session-f", "assistant-entry")
  )
  let finishActivation!: (runtime: FakeRuntime) => void
  const activation = new Promise<FakeRuntime>((resolve) => {
    finishActivation = resolve
  })
  state.activations.set(managed.webSessionId, activation)

  let shutdownRequests = 0
  let finishShutdown!: () => void
  state.request = async () => {
    shutdownRequests += 1
    await new Promise<void>((resolve) => {
      finishShutdown = resolve
    })
  }
  state.waitForExit = async () => {}

  const stopping = supervisor.stop(managed.webSessionId)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(shutdownRequests, 0)

  state.runtimes.set(managed.webSessionId, managed)
  finishActivation(managed)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(shutdownRequests, 1)
  finishShutdown()
  await stopping
})

test("activation waits until an archive or delete closure finishes", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime(
    "session-g",
    "ready",
    snapshot("session-g", "assistant-entry")
  )
  let finishClosure!: () => void
  const closure = state.runSessionClosure(
    [managed.webSessionId],
    () =>
      new Promise<void>((resolve) => {
        finishClosure = resolve
      })
  )
  await new Promise((resolve) => setImmediate(resolve))

  let starts = 0
  state.startRuntime = async () => {
    starts += 1
    return managed
  }
  const activation = supervisor.activate(managed.webSessionId)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(starts, 0)

  finishClosure()
  await closure
  assert.equal(await activation, managed)
  assert.equal(starts, 1)
  assert.equal(state.sessionClosures.size, 0)
})

test("resource reloads drain changes and model refresh RPCs stay serialized", async () => {
  const events = new EventHub()
  const supervisor = new RuntimeSupervisor(events)
  const state = internals(supervisor)
  const managed = runtime(
    "session-h",
    "ready",
    snapshot("session-h", "before-reload")
  )
  state.runtimes.set(managed.webSessionId, managed)
  const resolvers: ((value: RuntimeSnapshot) => void)[] = []
  state.request = async (_runtime, message) => {
    assert.equal(message.type, "runtime.reload-resources")
    return new Promise<RuntimeSnapshot>((resolve) => resolvers.push(resolve))
  }

  const first = state.reloadRuntimeResources(managed)
  const second = state.reloadRuntimeResources(managed)
  assert.equal(first, second)
  assert.equal(resolvers.length, 1)

  resolvers.shift()!(snapshot(managed.webSessionId, "first-reload"))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(resolvers.length, 1)
  resolvers.shift()!(snapshot(managed.webSessionId, "second-reload"))
  await Promise.all([first, second])

  assert.equal(managed.snapshot?.leafId, "second-reload")
  assert.equal(managed.pendingResourceReload, false)
  assert.equal(managed.resourceReloadPromise, null)
  assert.deepEqual(
    events.recent(managed.webSessionId).map((event) => event.type),
    ["runtime.starting", "runtime.ready", "runtime.starting", "runtime.ready"]
  )

  const started: string[] = []
  let releaseFirst!: () => void
  state.performResourceRequest = async (message) => {
    started.push(message.requestId)
    if (message.requestId === "first") {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
    }
    return message.requestId
  }
  const request = (requestId: string) =>
    state.resourceRequest({
      type: "models.refresh",
      requestId,
      payload: { cwd: "/workspace", agentDir: "/agent" },
    })

  const firstRpc = request("first")
  const secondRpc = request("second")
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, ["first"])

  releaseFirst()
  assert.deepEqual(await Promise.all([firstRpc, secondRpc]), [
    "first",
    "second",
  ])
  assert.deepEqual(started, ["first", "second"])
})

test("a failed model reload terminates the uncertain runtime", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  let kills = 0
  const managed = runtime(
    "session-i",
    "ready",
    snapshot("session-i", "before-reload"),
    () => {
      kills += 1
      return true
    }
  )
  state.runtimes.set(managed.webSessionId, managed)
  state.request = async () => {
    throw new Error("model reload failed")
  }

  await assert.rejects(
    state.reloadRuntimeModelSettings(managed),
    /model reload failed/
  )
  assert.equal(managed.status, "crashed")
  assert.equal(managed.pendingModelReload, false)
  assert.equal(managed.modelReloadPromise, null)
  assert.equal(kills, 1)
})

test("a model reload queued during a resource reload runs after it", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime(
    "session-j",
    "ready",
    snapshot("session-j", "before-reloads")
  )
  state.runtimes.set(managed.webSessionId, managed)
  const requests: string[] = []
  let finishResourceReload!: (value: RuntimeSnapshot) => void
  state.request = async (_runtime, message) => {
    requests.push(message.type)
    if (message.type === "runtime.reload-resources") {
      return new Promise<RuntimeSnapshot>((resolve) => {
        finishResourceReload = resolve
      })
    }
    assert.equal(message.type, "runtime.reload-model-settings")
    return snapshot(managed.webSessionId, "model-reloaded")
  }

  const resourceReload = state.reloadRuntimeResources(managed)
  await state.reloadModelSettings()
  assert.equal(managed.pendingModelReload, true)
  finishResourceReload(snapshot(managed.webSessionId, "resources-reloaded"))
  await resourceReload
  await new Promise((resolve) => setImmediate(resolve))
  await managed.modelReloadPromise

  assert.deepEqual(requests, [
    "runtime.reload-resources",
    "runtime.reload-model-settings",
  ])
  assert.equal(managed.snapshot?.leafId, "model-reloaded")
})

test("hot reload reuse initializes state added to an existing supervisor", () => {
  const managed = runtime(
    "session-k",
    "ready",
    snapshot("session-k", "existing-runtime")
  )
  delete (managed as Partial<FakeRuntime>).resourceReloadPromise
  delete (managed as Partial<FakeRuntime>).modelReloadPromise
  const supervisor = {
    runtimes: new Map([[managed.webSessionId, managed]]),
    activations: new Map(),
  } as unknown as RuntimeSupervisor

  const reused = RuntimeSupervisor.reuseAfterHotReload(supervisor)

  assert.equal(Object.getPrototypeOf(reused), RuntimeSupervisor.prototype)
  assert.ok(internals(reused).sessionClosures instanceof Map)
  assert.ok(internals(reused).resourceQueue instanceof Promise)
  assert.equal(managed.resourceReloadPromise, null)
  assert.equal(managed.modelReloadPromise, null)
})
