import assert from "node:assert/strict"
import test from "node:test"

import { SessionRuntimeController } from "./session-runtime-controller"
import {
  activeExtensionRequest,
  reconcileExtensionRequestSnapshot,
  reconcileTuiSurfaceSnapshot,
  runAfterSessionEventCheckpoint,
} from "./session-runtime-controller"
import type { ActiveExtensionRequest } from "./session-runtime-controller"
import type { RuntimeLeaseTimerHandle } from "./runtime-lease"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function timers() {
  let nextId = 0
  const entries = new Map<
    RuntimeLeaseTimerHandle,
    { callback: () => void; delay: number }
  >()
  return {
    entries,
    setTimer(callback: () => void, delay: number) {
      const id = ++nextId as unknown as RuntimeLeaseTimerHandle
      entries.set(id, { callback, delay })
      return id
    },
    clearTimer(id: RuntimeLeaseTimerHandle) {
      entries.delete(id)
    },
  }
}

function flush() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

function runtimeBody() {
  return {
    status: "ready",
    snapshot: null,
  }
}

test("StrictMode-style retain and a warm return share the existing lease", async () => {
  const calls: string[] = []
  const scheduled = timers()
  const controller = new SessionRuntimeController(
    "session-a",
    {
      status: "ready",
      snapshot: null,
    },
    {
      fetch: (async (_input, init) => {
        calls.push(init?.method ?? "GET")
        return new Response(JSON.stringify(runtimeBody()))
      }) as typeof fetch,
      leaseId: () => "stable-lease-a",
      leaseRetentionMs: 30_000,
      setTimer: scheduled.setTimer,
      clearTimer: scheduled.clearTimer,
    }
  )

  controller.retainLease("mutation")
  controller.releaseLease()
  controller.retainLease("mutation")
  await flush()

  assert.deepEqual(calls, ["POST"])
  assert.equal(controller.getSnapshot().leasePhase, "ready")
  assert.equal(
    [...scheduled.entries.values()].some((timer) => timer.delay === 30_000),
    false
  )
  controller.dispose()
})

test("a lease stays renewed across a longer session switch and releases after its bounded TTL", async () => {
  const calls: string[] = []
  const scheduled = timers()
  const controller = new SessionRuntimeController(
    "session-a",
    {
      status: "ready",
      snapshot: null,
    },
    {
      fetch: (async (_input, init) => {
        calls.push(init?.method ?? "GET")
        return new Response(JSON.stringify(runtimeBody()))
      }) as typeof fetch,
      leaseId: () => "stable-lease-a",
      leaseRetentionMs: 30_000,
      setTimer: scheduled.setTimer,
      clearTimer: scheduled.clearTimer,
    }
  )

  controller.retainLease("mutation")
  await flush()
  controller.releaseLease()
  assert.equal(calls.filter((method) => method === "DELETE").length, 0)

  const release = [...scheduled.entries].find(
    ([, timer]) => timer.delay === 30_000
  )
  assert.ok(release)
  scheduled.entries.get(release[0])!.callback()
  await flush()

  assert.deepEqual(calls, ["POST", "DELETE"])
  controller.dispose()
})

test("a failed renewal does not reacquire until an explicit retry", async () => {
  const calls: string[] = []
  const scheduled = timers()
  const controller = new SessionRuntimeController(
    "session-a",
    {
      status: "ready",
      snapshot: null,
    },
    {
      fetch: (async (_input, init) => {
        const method = init?.method ?? "GET"
        calls.push(method)
        return method === "PUT"
          ? new Response(JSON.stringify({ error: "expired" }), { status: 409 })
          : new Response(JSON.stringify(runtimeBody()))
      }) as typeof fetch,
      leaseId: () => "stable-lease-a",
      setTimer: scheduled.setTimer,
      clearTimer: scheduled.clearTimer,
    }
  )

  controller.retainLease("mutation")
  await flush()
  const renewal = [...scheduled.entries].find(
    ([, timer]) => timer.delay === 60_000
  )
  assert.ok(renewal)
  scheduled.entries.get(renewal[0])!.callback()
  await flush()

  assert.deepEqual(calls, ["POST", "PUT"])
  assert.equal(controller.getSnapshot().leasePhase, "error")
  controller.retryLease()
  await flush()
  assert.deepEqual(calls, ["POST", "PUT", "POST"])
  controller.dispose()
})

test("a queue event arriving during lease acquisition survives the lease snapshot", async () => {
  const pending = deferred<Response>()
  const queued = {
    id: "11111111-1111-4111-8111-111111111111",
    text: "keep this prompt",
    mode: "followUp" as const,
    kind: "message" as const,
  }
  const controller = new SessionRuntimeController(
    "session-a",
    {
      status: "ready",
      snapshot: null,
    },
    {
      fetch: (async () => pending.promise) as typeof fetch,
      leaseId: () => "stable-lease-a",
    }
  )

  controller.retainLease("mutation")
  controller.setQueuedMessages([queued])
  pending.resolve(new Response(JSON.stringify(runtimeBody())))
  await flush()

  assert.deepEqual(controller.getSnapshot().queuedMessages, [queued])
  assert.equal(controller.getSnapshot().queueRevision, 1)
  controller.dispose()
})

test("a late lease response cannot revive a stopped runtime", async () => {
  const pending = deferred<Response>()
  const controller = new SessionRuntimeController(
    "session-a",
    {
      status: "ready",
      snapshot: null,
    },
    {
      fetch: (async () => pending.promise) as typeof fetch,
      leaseId: () => "stable-lease-a",
    }
  )

  controller.retainLease("mutation")
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-1",
    type: "runtime.stopped",
    payload: {},
  })
  pending.resolve(
    new Response(JSON.stringify({ status: "ready", snapshot: null }))
  )
  await flush()

  assert.equal(controller.getSnapshot().leasePhase, "paused")
  assert.equal(controller.getSnapshot().status, "stopped")
  controller.dispose()
})

test("browser reconnect does not reacquire an explicitly stopped runtime", async () => {
  const calls: string[] = []
  const controller = new SessionRuntimeController(
    "session-a",
    {
      status: "ready",
      snapshot: null,
    },
    {
      fetch: (async (_input, init) => {
        calls.push(init?.method ?? "GET")
        return new Response(JSON.stringify(runtimeBody()))
      }) as typeof fetch,
      leaseId: () => "stable-lease-a",
    }
  )
  controller.retainLease("mutation")
  await flush()
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-1",
    type: "runtime.stopped",
    payload: {},
  })

  controller.reconnectLeaseIfRunning()
  await flush()
  assert.deepEqual(calls, ["POST"])
  assert.equal(controller.getSnapshot().leasePhase, "paused")
  controller.retryLease()
  await flush()
  assert.deepEqual(calls, ["POST", "POST"])
  controller.dispose()
})

test("a late acquire error cannot replace the paused state after stop", async () => {
  const pending = deferred<Response>()
  const controller = new SessionRuntimeController(
    "session-a",
    {
      status: "ready",
      snapshot: null,
    },
    {
      fetch: (async () => pending.promise) as typeof fetch,
      leaseId: () => "stable-lease-a",
    }
  )

  controller.retainLease("mutation")
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-1",
    type: "runtime.stopped",
    payload: {},
  })
  pending.reject(new Error("late acquire failure"))
  await flush()

  assert.equal(controller.getSnapshot().leasePhase, "paused")
  assert.equal(controller.getSnapshot().leaseError, null)
  assert.equal(controller.getSnapshot().status, "stopped")
  controller.dispose()
})

test("the cached runtime controller retains queue, TUI and extension state while the viewport is absent", () => {
  const controller = new SessionRuntimeController("session-a", {
    status: "busy",
    snapshot: null,
  })
  const queued = {
    id: "11111111-1111-4111-8111-111111111111",
    text: "background follow-up",
    mode: "followUp" as const,
    kind: "message" as const,
  }

  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-1",
    type: "queue.updated",
    payload: { steering: [], followUp: [], items: [queued] },
  })
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-2",
    type: "tui.surface",
    payload: {
      version: 1,
      kind: "open",
      surface: {
        version: 1,
        surfaceId: "22222222-2222-4222-8222-222222222222",
        mode: "inline",
        placement: "aboveEditor",
        progress: false,
        columns: 80,
        rows: 24,
        revision: 0,
        data: "prompt",
      },
    },
  })
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-3",
    type: "extension.ui.request",
    payload: {
      requestId: "request-1",
      method: "input",
      title: "Background request",
      expiresAt: null,
    },
  })

  const state = controller.getSnapshot()
  assert.deepEqual(state.queuedMessages, [queued])
  assert.equal(
    state.tuiSurfaces["22222222-2222-4222-8222-222222222222"]?.data,
    "prompt"
  )
  assert.equal(state.extensionRequests[0]?.requestId, "request-1")
  controller.dispose()
})

test("TUI and extension deltas merge into two-snapshot baselines without invalidating loads", () => {
  const controller = new SessionRuntimeController("session-a", {
    status: "ready",
    snapshot: null,
  })
  const tuiSequence = controller.beginTuiLoad()
  const tuiGeneration = controller.getTuiGeneration()
  const requestSequence = controller.beginExtensionRequestLoad()
  const requestGeneration = controller.getExtensionRequestGeneration()
  const firstSurfaceId = "22222222-2222-4222-8222-222222222222"
  const secondSurfaceId = "33333333-3333-4333-8333-333333333333"
  const surface = (surfaceId: string, data: string) => ({
    version: 1 as const,
    surfaceId,
    mode: "inline" as const,
    placement: "aboveEditor" as const,
    progress: false,
    columns: 80,
    rows: 24,
    revision: 1,
    data,
  })
  const write = {
    version: 1 as const,
    kind: "write" as const,
    surfaceId: firstSurfaceId,
    revision: 2,
    data: " + delta",
  }
  const close = {
    version: 1 as const,
    kind: "close" as const,
    surfaceId: secondSurfaceId,
  }

  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-2",
    type: "tui.surface",
    payload: write,
  })
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-3",
    type: "tui.surface",
    payload: close,
  })
  assert.equal(controller.isCurrentTuiLoad(tuiSequence, tuiGeneration), true)

  const surfaces = reconcileTuiSurfaceSnapshot(
    [surface(firstSurfaceId, "alpha"), surface(secondSurfaceId, "beta")],
    new Map(),
    [write, close]
  )
  assert.deepEqual(surfaces.surfaces[firstSurfaceId]?.data, "alpha + delta")
  assert.equal(surfaces.surfaces[secondSurfaceId], undefined)

  const firstPrompt = activeExtensionRequest(
    "prompt-1",
    {
      method: "input",
      title: "First prompt",
    },
    null
  )
  const closedPrompt = activeExtensionRequest(
    "prompt-2",
    {
      method: "confirm",
      title: "Second prompt",
      message: "Confirm?",
    },
    null
  )
  const newPrompt = activeExtensionRequest(
    "prompt-3",
    {
      method: "input",
      title: "Arrived during load",
    },
    null
  )
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-4",
    type: "extension.ui.request",
    payload: { ...newPrompt },
  })
  controller.applyEvent({
    id: "event-11111111-1111-4111-8111-111111111111-5",
    type: "extension.ui.closed",
    payload: { requestId: closedPrompt.requestId },
  })
  assert.equal(
    controller.isCurrentExtensionRequestLoad(
      requestSequence,
      requestGeneration
    ),
    true
  )

  const current: ActiveExtensionRequest[] = [
    { ...firstPrompt, value: "typed while loading" },
  ]
  const prompts = reconcileExtensionRequestSnapshot(
    [firstPrompt, closedPrompt],
    [newPrompt],
    new Set([closedPrompt.requestId]),
    Date.now(),
    current
  )
  assert.deepEqual(
    prompts.map((prompt) => prompt.requestId),
    [firstPrompt.requestId, newPrompt.requestId]
  )
  assert.equal(prompts[0]?.value, "typed while loading")
  controller.dispose()
})

test("runtime snapshot GET helper waits for the event replay checkpoint", async () => {
  const checkpoint = deferred<string>()
  let started = false
  const loading = runAfterSessionEventCheckpoint(
    checkpoint.promise,
    async () => {
      started = true
    }
  )
  await flush()
  assert.equal(started, false)
  checkpoint.resolve("event-11111111-1111-4111-8111-111111111111-3")
  await loading
  assert.equal(started, true)
})

test("an accepted HTTP runtime cursor fences stale runtime events but not TUI events", () => {
  const controller = new SessionRuntimeController("session-a", {
    status: "ready",
    snapshot: null,
  })
  const epoch = "11111111-1111-4111-8111-111111111111"
  const queue = (text: string) => ({
    steering: [],
    followUp: [],
    items: [
      {
        id: text,
        text,
        mode: "followUp" as const,
        kind: "message" as const,
      },
    ],
  })
  const acceptedQueue = queue("snapshot C3")
  controller.setAuthoritativeState(
    { status: "busy", snapshot: null },
    `event-${epoch}-3`
  )
  controller.setQueuedMessages(acceptedQueue.items)
  controller.applyEvent({
    id: `event-${epoch}-2`,
    type: "queue.updated",
    payload: queue("stale C2"),
  })
  assert.equal(controller.getSnapshot().queuedMessages[0]?.text, "snapshot C3")
  assert.equal(controller.getSnapshot().status, "busy")

  controller.applyEvent({
    id: `event-${epoch}-2`,
    type: "tui.surface",
    payload: {
      version: 1,
      kind: "open",
      surface: {
        version: 1,
        surfaceId: "44444444-4444-4444-8444-444444444444",
        mode: "inline",
        progress: false,
        columns: 80,
        rows: 24,
        revision: 0,
        data: "must still arrive",
      },
    },
  })
  assert.equal(
    controller.getSnapshot().tuiSurfaces["44444444-4444-4444-8444-444444444444"]
      ?.data,
    "must still arrive"
  )
  controller.dispose()
})

test("a skipped HTTP runtime projection does not advance the runtime event fence", () => {
  const controller = new SessionRuntimeController("session-a", {
    status: "ready",
    snapshot: null,
  })
  const epoch = "11111111-1111-4111-8111-111111111111"
  controller.advanceGeneration()
  controller.applyEvent({
    id: `event-${epoch}-2`,
    type: "queue.updated",
    payload: {
      steering: [],
      followUp: [],
      items: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          text: "late event after skipped projection",
          mode: "followUp",
          kind: "message",
        },
      ],
    },
  })
  assert.equal(
    controller.getSnapshot().queuedMessages[0]?.text,
    "late event after skipped projection"
  )
  controller.dispose()
})
