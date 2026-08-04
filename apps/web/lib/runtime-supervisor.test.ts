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
  pending: Map<string, unknown>
  child: { kill(): boolean }
}

interface RuntimeSupervisorInternals {
  runtimes: Map<string, FakeRuntime>
  activations: Map<string, Promise<FakeRuntime>>
  request(runtime: FakeRuntime, message: { type: string }): Promise<unknown>
  reloadRuntimeResources(runtime: FakeRuntime): Promise<RuntimeSnapshot>
  refreshSettledRuntimeSnapshot(runtime: FakeRuntime): Promise<void>
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
    pending: new Map(),
    child: { kill },
  }
}

function internals(supervisor: RuntimeSupervisor) {
  return supervisor as unknown as RuntimeSupervisorInternals
}

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
