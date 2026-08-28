import assert from "node:assert/strict"
import test from "node:test"

import type {
  RuntimeSnapshot,
  RuntimeStatus,
} from "@workspace/runtime-protocol"

import { EventHub } from "./event-hub"
import { RuntimeSupervisor } from "./runtime-supervisor"

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
  runSessionClosure<T>(
    sessionIds: string[],
    operation: () => Promise<T>
  ): Promise<T>
  reloadRuntimeModelSettings(runtime: FakeRuntime): Promise<RuntimeSnapshot>
  reloadRuntimeResources(runtime: FakeRuntime): Promise<RuntimeSnapshot>
  reloadModelSettings(): Promise<void>
  resourceQueue: Promise<void>
  resourceRequest(message: {
    type: "models.catalog" | "models.refresh"
    requestId: string
    payload: { cwd: string; agentDir: string }
  }): Promise<unknown>
  performResourceRequest(
    message: { requestId: string },
    timeoutMs: number
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

  await supervisor.refreshModelSettings("/workspace")

  assert.deepEqual(calls, ["models.refresh", "runtime.reload-model-settings"])
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

test("resource reloads drain changes and resource RPCs stay serialized", async () => {
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
      type: "models.catalog",
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
