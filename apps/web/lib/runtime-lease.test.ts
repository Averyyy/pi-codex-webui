import assert from "node:assert/strict"
import test from "node:test"

import {
  RuntimeLeaseController,
  type RuntimeLeaseCallbacks,
  type RuntimeLeaseTimerHandle,
  type RuntimeLeaseTransport,
} from "./runtime-lease"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function flush() {
  return new Promise<void>((resolve) => queueMicrotask(resolve))
}

function transportFixture() {
  const acquired: Array<ReturnType<typeof deferred<{ id: string }>>> = []
  const renewed: Array<ReturnType<typeof deferred<{ id: string }>>> = []
  const releases: Array<[string, string]> = []
  const transport: RuntimeLeaseTransport<{ id: string }> = {
    acquire(sessionId, leaseId) {
      const request = deferred<{ id: string }>()
      acquired.push(request)
      void sessionId
      void leaseId
      return request.promise
    },
    renew(sessionId, leaseId) {
      const request = deferred<{ id: string }>()
      renewed.push(request)
      void sessionId
      void leaseId
      return request.promise
    },
    async release(sessionId, leaseId) {
      releases.push([sessionId, leaseId])
    },
  }
  return { transport, acquired, renewed, releases }
}

function callbacks() {
  const events: Array<
    | { type: "ready"; id: string; operation: "acquire" | "renew" }
    | { type: "error"; operation: "acquire" | "renew" }
  > = []
  const value: RuntimeLeaseCallbacks<{ id: string }> = {
    onReady(result, operation) {
      events.push({ type: "ready", id: result.id, operation })
    },
    onError(_error, operation) {
      events.push({ type: "error", operation })
    },
  }
  return { value, events }
}

test("releases an acquire that finishes after the owner was released", async () => {
  const fixture = transportFixture()
  const observed = callbacks()
  const controller = new RuntimeLeaseController(
    fixture.transport,
    observed.value
  )

  controller.start("session-a", "lease-a")
  controller.release()
  fixture.acquired[0]!.resolve({ id: "late-a" })
  await flush()

  assert.deepEqual(observed.events, [])
  assert.deepEqual(fixture.releases, [["session-a", "lease-a"]])
})

test("ignores a stale session acquire and releases its lease", async () => {
  const fixture = transportFixture()
  const observed = callbacks()
  const controller = new RuntimeLeaseController(
    fixture.transport,
    observed.value
  )

  controller.start("session-a", "lease-a")
  controller.start("session-b", "lease-b")
  fixture.acquired[0]!.resolve({ id: "stale-a" })
  await flush()
  fixture.acquired[1]!.resolve({ id: "current-b" })
  await flush()

  assert.deepEqual(observed.events, [
    { type: "ready", id: "current-b", operation: "acquire" },
  ])
  assert.deepEqual(fixture.releases, [["session-a", "lease-a"]])
  controller.release()
})

test("releases after an in-flight reconnect acquire reaches the server", async () => {
  const reconnect = deferred<{ id: string }>()
  const releases: Array<[string, string]> = []
  let acquireCalls = 0
  const transport: RuntimeLeaseTransport<{ id: string }> = {
    acquire(sessionId, leaseId) {
      acquireCalls += 1
      void sessionId
      void leaseId
      return acquireCalls === 1
        ? Promise.resolve({ id: "initial" })
        : reconnect.promise
    },
    renew: async () => ({ id: "renewed" }),
    async release(sessionId, leaseId) {
      releases.push([sessionId, leaseId])
    },
  }
  const observed = callbacks()
  const controller = new RuntimeLeaseController(transport, observed.value)

  controller.start("session-a", "lease-a")
  await flush()
  controller.reconnect()
  controller.release()

  assert.deepEqual(releases, [])
  reconnect.resolve({ id: "reconnected" })
  await flush()

  assert.deepEqual(releases, [["session-a", "lease-a"]])
})

test("does not reacquire after a failed renewal until an explicit reconnect", async () => {
  const fixture = transportFixture()
  const observed = callbacks()
  let now = 0
  const timers = new Map<RuntimeLeaseTimerHandle, () => void>()
  const controller = new RuntimeLeaseController(
    fixture.transport,
    observed.value,
    {
      renewAfterMs: 10,
      setTimer(callback) {
        const id = ++now as unknown as RuntimeLeaseTimerHandle
        timers.set(id, callback)
        return id
      },
      clearTimer(id) {
        timers.delete(id)
      },
    }
  )

  controller.start("session-a", "lease-a")
  fixture.acquired[0]!.resolve({ id: "ready-a" })
  await flush()
  ;[...timers.values()][0]?.()
  fixture.renewed[0]!.reject(new Error("expired"))
  await flush()

  assert.deepEqual(observed.events, [
    { type: "ready", id: "ready-a", operation: "acquire" },
    { type: "error", operation: "renew" },
  ])
  assert.equal(fixture.acquired.length, 1)

  controller.reconnect()
  assert.equal(fixture.acquired.length, 2)
  fixture.acquired[1]!.resolve({ id: "reconnected-a" })
  await flush()
  assert.deepEqual(observed.events.at(-1), {
    type: "ready",
    id: "reconnected-a",
    operation: "acquire",
  })
  controller.release()
})
