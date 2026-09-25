import assert from "node:assert/strict"
import test from "node:test"

import type {
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
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
  cleaned: boolean
  pendingResourceReload: boolean
  pendingModelReload: boolean
  pending: Map<string, unknown>
  stopPromise: Promise<void> | null
  resourceReloadPromise: Promise<RuntimeSnapshot> | null
  modelReloadPromise: Promise<RuntimeSnapshot> | null
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
  request(runtime: FakeRuntime, message: { type: string }): Promise<unknown>
  startRuntime(sessionId: string): Promise<FakeRuntime>
  stop(sessionId: string): Promise<void>
  runSessionClosure<T>(
    sessionIds: string[],
    operation: () => Promise<T>
  ): Promise<T>
  reloadRuntimeModelSettings(runtime: FakeRuntime): Promise<RuntimeSnapshot>
  reloadRuntimeResources(runtime: FakeRuntime): Promise<RuntimeSnapshot>
  reloadModelSettings(): Promise<void>
  resourceWorkers: Map<string, unknown>
  inflightResources: Map<string, Promise<unknown>>
  modelSettingsCache: Map<string, unknown>
  resourceRequest(
    message: {
      type: "models.catalog" | "models.refresh"
      requestId: string
      payload: { cwd: string; agentDir: string; scope?: "all" | "enabled" }
    },
    timeoutMs?: number,
    runtimeTarget?: ModelSettingsRuntimeTarget
  ): Promise<unknown>
  performResourceRequest(
    message: { requestId: string },
    timeoutMs: number,
    runtimeTarget?: ModelSettingsRuntimeTarget
  ): Promise<unknown>
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
    status,
    snapshot: currentSnapshot,
    cleaned: false,
    pendingResourceReload: false,
    pendingModelReload: false,
    pending: new Map(),
    stopPromise: null,
    resourceReloadPromise: null,
    modelReloadPromise: null,
    child: { exitCode: null, signalCode: null, kill },
  }
}

function internals(supervisor: RuntimeSupervisor) {
  return supervisor as unknown as RuntimeSupervisorInternals
}

test("model refresh invokes Pi refresh before reloading active runtimes", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const calls: string[] = []
  state.resourceRequest = async (message) => {
    calls.push(message.type)
    return {
      models: [],
      providers: [],
      enabledModels: null,
      defaultModel: null,
    }
  }
  state.reloadModelSettings = async () => {
    calls.push("runtime.reload-model-settings")
  }

  await supervisor.refreshModelSettings({
    cwd: "/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
  })

  assert.deepEqual(calls, ["models.refresh", "runtime.reload-model-settings"])
})

test("model resource operations carry the selected runtime target", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const target = {
    cwd: "/workspace",
    runtimeProfileId: "pi-client-default",
    runtimeKind: "pi-client" as const,
  }
  const calls: {
    type: string
    runtimeTarget: ModelSettingsRuntimeTarget | undefined
  }[] = []
  const settings = {
    models: [],
    providers: [],
    enabledModels: null,
    defaultModel: null,
  }
  state.resourceRequest = async (message, _timeoutMs, runtimeTarget) => {
    calls.push({ type: message.type, runtimeTarget })
    return settings
  }
  state.reloadModelSettings = async () => {}

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
    calls.map(({ type }) => type),
    [
      "models.catalog",
      "models.refresh",
      "models.set-scope",
      "providers.save",
      "providers.remove",
    ]
  )
  assert.equal(
    calls.every(
      ({ runtimeTarget }) =>
        runtimeTarget?.cwd === target.cwd &&
        runtimeTarget.runtimeProfileId === target.runtimeProfileId &&
        runtimeTarget.runtimeKind === target.runtimeKind
    ),
    true
  )
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

test("resource reloads drain changes and identical resource RPCs dedupe", async () => {
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
  const request = (requestId: string, cwd = "/workspace") =>
    state.resourceRequest({
      type: "models.catalog",
      requestId,
      payload: { cwd, agentDir: "/agent" },
    })

  // Identical in-flight requests share one worker call and one result.
  const firstRpc = request("first")
  const duplicateRpc = request("duplicate")
  assert.equal(firstRpc, duplicateRpc)

  // A distinct payload runs as its own request without head-of-line blocking.
  const otherRpc = request("other", "/other-workspace")
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started.sort(), ["first", "other"])

  releaseFirst()
  assert.deepEqual(await Promise.all([firstRpc, otherRpc]), [
    "first",
    "other",
  ])
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
  assert.ok(internals(reused).resourceWorkers instanceof Map)
  assert.ok(internals(reused).inflightResources instanceof Map)
  assert.ok(internals(reused).modelSettingsCache instanceof Map)
  assert.equal(managed.resourceReloadPromise, null)
  assert.equal(managed.modelReloadPromise, null)
})
