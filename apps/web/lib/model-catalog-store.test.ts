import assert from "node:assert/strict"
import test from "node:test"

import type { ModelSettingsModel } from "@workspace/runtime-protocol"
import {
  createModelCatalogStore,
  type ModelCatalogSnapshot,
  type ModelCatalogTarget,
} from "@/lib/model-catalog-store"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function model(id: string, enabled: boolean): ModelSettingsModel {
  return {
    provider: "fixture",
    id,
    name: id,
    reasoning: true,
    input: ["text"],
    contextWindow: 32_000,
    maxTokens: 4_000,
    enabled,
    availableThinkingLevels: ["low"],
    defaultThinkingLevel: "low",
  }
}

function snapshot(
  catalogIdentity: string,
  catalogVersion: string,
  models: ModelSettingsModel[] = []
): ModelCatalogSnapshot {
  return {
    catalogIdentity,
    catalogVersion,
    models,
    providers: [],
    enabledModels: models
      .filter((entry) => entry.enabled)
      .map((entry) => `${entry.provider}/${entry.id}`),
    defaultModel: null,
  }
}

function response(value: unknown, status = 200) {
  return Response.json(value, { status })
}

function setFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
  const original = globalThis.fetch
  globalThis.fetch = handler as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test("a published mutation supersedes an older in-flight GET", async () => {
  const pending = deferred<Response>()
  const restoreFetch = setFetch(() => pending.promise)
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { projectId: "project-a" }
    const read = store.load(target, "all")
    const current = snapshot("directory-a", "version-2")

    store.publish(target, "all", current)
    pending.resolve(response(snapshot("directory-a", "version-1")))
    await read

    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-2"
    )
  } finally {
    restoreFetch()
  }
})

test("a delayed mutation response cannot overwrite a catalog after authoritative invalidation", async () => {
  const restoreFetch = setFetch(async () =>
    response(snapshot("directory-new", "v2"))
  )
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { projectId: "project-a" }
    store.publish(target, "all", snapshot("directory-old", "v1"))
    const token = store.beginMutation(target, "all")

    store.invalidate(target, "all")
    await store.load(target, "all")
    const applied = store.publishMutation(
      target,
      "all",
      token,
      snapshot("directory-old", "late-v1")
    )

    assert.equal(applied, false)
    assert.equal(
      store.getState(target, "all").snapshot?.catalogIdentity,
      "directory-new"
    )
    assert.equal(store.getState(target, "all").snapshot?.catalogVersion, "v2")
    store.finishMutation(target, "all", token)
  } finally {
    restoreFetch()
  }
})

test("identity changes rebind only the request target whose response changed", async () => {
  const restoreFetch = setFetch(async () =>
    response(snapshot("directory-old", "v1"))
  )
  try {
    const store = createModelCatalogStore()
    const targetA: ModelCatalogTarget = { projectId: "project-a" }
    const targetB: ModelCatalogTarget = { sessionId: "session-b" }
    await store.load(targetA, "all")
    await store.load(targetB, "all")

    globalThis.fetch = (async () =>
      response(snapshot("directory-new", "v2"))) as typeof fetch
    await store.load(targetA, "all", { force: true })

    assert.equal(
      store.getState(targetA, "all").snapshot?.catalogIdentity,
      "directory-new"
    )
    assert.equal(
      store.getState(targetB, "all").snapshot?.catalogIdentity,
      "directory-old"
    )
  } finally {
    restoreFetch()
  }
})

test("publishing a new runtime identity does not migrate sibling aliases", async () => {
  const restoreFetch = setFetch(async () =>
    response(snapshot("directory-old", "v1"))
  )
  try {
    const store = createModelCatalogStore()
    const targetA: ModelCatalogTarget = { projectId: "project-a" }
    const targetB: ModelCatalogTarget = { sessionId: "session-b" }
    await store.load(targetA, "all")
    await store.load(targetB, "all")

    store.publish(targetA, "all", snapshot("directory-new", "v2"))

    assert.equal(
      store.getState(targetA, "all").snapshot?.catalogIdentity,
      "directory-new"
    )
    assert.equal(
      store.getState(targetB, "all").snapshot?.catalogIdentity,
      "directory-old"
    )
  } finally {
    restoreFetch()
  }
})

test("target invalidation cannot be repopulated by a sibling identity refresh", async () => {
  const restoreFetch = setFetch(async () =>
    response(snapshot("directory-old", "v1"))
  )
  try {
    const store = createModelCatalogStore()
    const targetA: ModelCatalogTarget = { projectId: "project-a" }
    const targetB: ModelCatalogTarget = { sessionId: "session-b" }
    await store.load(targetA, "all")
    await store.load(targetB, "all")

    store.invalidate(targetA, "all")
    await store.load(targetB, "all", { force: true })
    assert.equal(store.getState(targetA, "all").snapshot, null)

    globalThis.fetch = (async () =>
      response(snapshot("directory-new", "v2"))) as typeof fetch
    await store.load(targetA, "all")
    assert.equal(
      store.getState(targetA, "all").snapshot?.catalogIdentity,
      "directory-new"
    )
  } finally {
    restoreFetch()
  }
})

test("global events invalidate only the matching catalog version identity", async () => {
  const restoreFetch = setFetch(async () =>
    response(snapshot("directory-a", "v1"))
  )
  try {
    const store = createModelCatalogStore()
    const targetA: ModelCatalogTarget = { projectId: "project-a" }
    const targetB: ModelCatalogTarget = { sessionId: "session-b" }
    const old = snapshot("directory-a", "v1")
    store.publish(targetA, "all", old)
    await store.load(targetB, "all")

    assert.deepEqual(store.invalidateIdentity("directory-a", "v1"), [])
    assert.equal(store.getState(targetA, "all").snapshot?.catalogVersion, "v1")

    store.invalidateIdentity("directory-a", "v2")
    assert.equal(store.getState(targetA, "all").snapshot, null)
    assert.equal(store.getState(targetB, "all").snapshot, null)
  } finally {
    restoreFetch()
  }
})

test("repeated identity invalidations fence a pending replacement GET", async () => {
  const pending = deferred<Response>()
  let calls = 0
  const restoreFetch = setFetch(async () => {
    calls += 1
    return calls === 1
      ? pending.promise
      : response(snapshot("directory-a", "version-3"))
  })
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { projectId: "project-a" }
    store.publish(target, "all", snapshot("directory-a", "version-1"))
    const unsubscribe = store.subscribe(target, "all", () => {})

    assert.deepEqual(store.invalidateIdentity("directory-a", "version-2"), [
      { target, scope: "all" },
    ])
    const staleRead = store.load(target, "all", { force: true })
    assert.deepEqual(store.invalidateIdentity("directory-a", "version-3"), [
      { target, scope: "all" },
    ])
    assert.equal(store.getState(target, "all").snapshot, null)

    pending.resolve(response(snapshot("directory-a", "version-2")))
    await assert.rejects(staleRead, /changed while this request was in flight/)
    assert.equal(store.getState(target, "all").snapshot, null)

    await store.load(target, "all")
    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-3"
    )
    unsubscribe()
  } finally {
    restoreFetch()
  }
})

test("data-refresh invalidation preserves the old snapshot while its refresh response is pending", async () => {
  const pending = deferred<Response>()
  const restoreFetch = setFetch(() => pending.promise)
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { projectId: "project-a" }
    store.publish(target, "all", snapshot("directory-a", "version-1"))
    const refresh = store.refresh(target, "mutation-token")

    store.revalidateIdentity("directory-a", "version-2")
    const duringRefresh = store.getState(target, "all")
    assert.equal(duringRefresh.snapshot?.catalogVersion, "version-1")
    assert.equal(duringRefresh.catalogIdentity, "directory-a")
    assert.equal(duringRefresh.status, "refreshing")

    pending.resolve(response(snapshot("directory-a", "version-2")))
    await refresh
    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-2"
    )
  } finally {
    restoreFetch()
  }
})

test("a separate tab keeps its old catalog visible until its data-refresh GET resolves", async () => {
  const pending = deferred<Response>()
  const restoreFetch = setFetch(() => pending.promise)
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { projectId: "project-a" }
    store.publish(target, "all", snapshot("directory-a", "version-1"))
    const unsubscribe = store.subscribe(target, "all", () => {})
    const targets = store.revalidateIdentity("directory-a", "version-2")
    assert.deepEqual(targets, [{ target, scope: "all" }])
    const read = store.load(target, "all", { force: true })

    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-1"
    )
    assert.equal(store.getState(target, "all").status, "refreshing")

    pending.resolve(response(snapshot("directory-a", "version-2")))
    await read
    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-2"
    )
    unsubscribe()
  } finally {
    restoreFetch()
  }
})

test("explicit refresh waits behind an in-flight GET and then sends a POST", async () => {
  const pendingRead = deferred<Response>()
  const calls: Array<{ url: string; method: string; token?: string }> = []
  const restoreFetch = setFetch(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push({
      url,
      method,
      token:
        new Headers(init?.headers).get("X-Pi-Web-Codex-Mutation-Token") ??
        undefined,
    })
    if (method === "GET") return pendingRead.promise
    return response(snapshot("directory-a", "version-2"))
  })
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { newTask: true }
    const read = store.load(target, "all")
    const refresh = store.refresh(target, "mutation-token")
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.method, "GET")

    pendingRead.resolve(response(snapshot("directory-a", "version-1")))
    await Promise.all([read, refresh])

    assert.deepEqual(
      calls.map(({ method }) => method),
      ["GET", "POST"]
    )
    assert.equal(calls[1]?.token, "mutation-token")
    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-2"
    )
  } finally {
    restoreFetch()
  }
})

test("sequential refreshes are not stuck on a settled flight and publish enabled scope", async () => {
  let revision = 0
  const fixtureModels = [model("enabled", true), model("disabled", false)]
  const restoreFetch = setFetch(async (_input, init) => {
    assert.equal(init?.method, "POST")
    revision += 1
    return response(
      snapshot("directory-a", `version-${revision}`, fixtureModels)
    )
  })
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { defaultTarget: true }

    await store.refresh(target, "mutation-token")
    await store.refresh(target, "mutation-token")

    assert.equal(revision, 2)
    assert.deepEqual(
      store
        .getState(target, "enabled")
        .snapshot?.models.map((entry) => entry.id),
      ["enabled"]
    )
    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-2"
    )
  } finally {
    restoreFetch()
  }
})

test("a failed refresh can be retried and leaves its prior snapshot visible", async () => {
  let attempts = 0
  const restoreFetch = setFetch(async () => {
    attempts += 1
    return attempts === 1
      ? response({ error: "temporary refresh failure" }, 502)
      : response(snapshot("directory-a", "version-2"))
  })
  try {
    const store = createModelCatalogStore()
    const target: ModelCatalogTarget = { projectId: "project-a" }
    store.publish(target, "all", snapshot("directory-a", "version-1"))

    await assert.rejects(store.refresh(target, "mutation-token"))
    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-1"
    )
    assert.equal(store.getState(target, "all").status, "error")

    await store.refresh(target, "mutation-token")
    assert.equal(
      store.getState(target, "all").snapshot?.catalogVersion,
      "version-2"
    )
    assert.equal(store.getState(target, "all").status, "ready")
  } finally {
    restoreFetch()
  }
})
