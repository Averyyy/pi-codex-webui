import assert from "node:assert/strict"
import test from "node:test"

import type { WebUiViewSnapshot } from "@workspace/runtime-protocol"
import type { WebUiExtensionCatalogView } from "@/lib/webui-extensions/types"
import {
  createSessionExtensionStore,
  loadSessionExtensionViewsAfterCheckpoint,
  sessionExtensionStoreKey,
} from "@/lib/session-extension-store"

function view(
  instanceId: string,
  revision: number,
  state: unknown,
  placement: WebUiViewSnapshot["placement"] = "composer.above"
): WebUiViewSnapshot {
  return {
    version: 1,
    extensionId: "fixture",
    adapterKey: "fixture/adapter",
    viewId: instanceId,
    instanceId,
    placement,
    revision,
    state,
    blocking: false,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function catalog(
  projectId: string,
  projectTrusted: boolean,
  revision: number
): WebUiExtensionCatalogView {
  return {
    catalogIdentity: `identity-${projectId}`,
    catalogVersion: `version-${revision}`,
    revision,
    projectId,
    projectTrusted,
    groups: [],
    diagnostics: [],
    statuses: [],
  }
}

test("view updates notify only the affected instance subscriber", () => {
  const store = createSessionExtensionStore()
  const key = sessionExtensionStoreKey("session-a", "runtime-a")
  const first = view("00000000-0000-4000-8000-000000000001", 1, { count: 1 })
  const second = view("00000000-0000-4000-8000-000000000002", 1, { count: 2 })
  store.seedViews(key, [first, second])
  let firstUpdates = 0
  let secondUpdates = 0
  let placementUpdates = 0
  store.subscribeView(key, first.instanceId, () => firstUpdates++)
  store.subscribeView(key, second.instanceId, () => secondUpdates++)
  store.subscribePlacement(key, "composer.above", () => placementUpdates++)
  const idsBefore = store.getViewIds(key, "composer.above")

  store.applyViewEvent(key, {
    version: 1,
    kind: "update",
    view: view(first.instanceId, 2, { count: 3 }),
  })

  assert.equal(firstUpdates, 1)
  assert.equal(secondUpdates, 0)
  assert.equal(placementUpdates, 0)
  assert.equal(store.getViewIds(key, "composer.above"), idsBefore)
  assert.deepEqual(store.getView(key, first.instanceId)?.state, { count: 3 })
})

test("view events arriving during snapshot loading replay over the stale response", async () => {
  const store = createSessionExtensionStore()
  const key = sessionExtensionStoreKey("session-a", "runtime-a")
  const pending = deferred<WebUiViewSnapshot[]>()
  const loading = store.loadViews(key, () => pending.promise)
  const current = view("00000000-0000-4000-8000-000000000001", 2, { count: 2 })
  store.applyViewEvent(key, { version: 1, kind: "open", view: current })

  pending.resolve([
    view(current.instanceId, 1, { count: 1 }),
    view("00000000-0000-4000-8000-000000000002", 1, { count: 1 }),
  ])
  await loading

  assert.equal(store.getView(key, current.instanceId)?.revision, 2)
  assert.deepEqual(store.getView(key, current.instanceId)?.state, { count: 2 })
  assert.equal(store.getViewIds(key, "composer.above").length, 2)
})

test("initial view snapshot waits for the replay checkpoint before fetching", async () => {
  const store = createSessionExtensionStore()
  const key = sessionExtensionStoreKey("session-cold", "runtime-cold")
  const opened = view("00000000-0000-4000-8000-000000000003", 1, { count: 1 })
  let resolveCheckpoint!: () => void
  const checkpoint = new Promise<void>((resolve) => {
    resolveCheckpoint = resolve
  })
  const serverViews = new Map<string, WebUiViewSnapshot>()
  let reads = 0
  const load = loadSessionExtensionViewsAfterCheckpoint(
    store,
    key,
    () => checkpoint,
    async () => {
      reads += 1
      return [...serverViews.values()]
    }
  )

  assert.equal(reads, 0)
  serverViews.set(opened.instanceId, opened)
  resolveCheckpoint()
  await load

  assert.equal(reads, 1)
  assert.deepEqual(store.getView(key, opened.instanceId), opened)
})

test("a runtime generation change rejects an older pending snapshot", async () => {
  const store = createSessionExtensionStore()
  const key = sessionExtensionStoreKey("session-a", "runtime-a")
  const pending = deferred<WebUiViewSnapshot[]>()
  const loading = store.loadViews(key, () => pending.promise)

  store.beginRuntimeGeneration(key)
  pending.resolve([
    view("00000000-0000-4000-8000-000000000001", 1, { count: 1 }),
  ])
  await loading

  assert.deepEqual(store.getViewIds(key, "composer.above"), [])
  assert.equal(store.getState(key).viewsStatus, "idle")
})

test("global catalog invalidation marks every cached session while project updates stay scoped", () => {
  const store = createSessionExtensionStore()
  const projectA = sessionExtensionStoreKey("session-a", "runtime-a")
  const projectB = sessionExtensionStoreKey("session-b", "runtime-b")
  store.registerTarget(projectA, "project-a")
  store.registerTarget(projectB, "project-b")

  store.invalidateCatalogs("project-a")
  assert.equal(store.getState(projectA).catalogInvalidated, true)
  assert.equal(store.getState(projectB).catalogInvalidated, false)

  store.invalidateCatalogs(null)
  assert.equal(store.getState(projectB).catalogInvalidated, true)
})

test("data refresh keeps a cached catalog usable while security invalidation blocks it", () => {
  const store = createSessionExtensionStore()
  const key = sessionExtensionStoreKey("session-a", "runtime-a")
  store.registerTarget(key, "project-a")
  const current = catalog("project-a", true, 1)
  store.seedCatalog(key, current)

  store.invalidateCatalogs(
    "project-a",
    current.catalogIdentity,
    "version-2",
    "data-refresh"
  )
  const refreshing = store.getState(key)
  assert.equal(refreshing.catalog, current)
  assert.equal(refreshing.catalogInvalidated, false)
  assert.equal(refreshing.catalogNeedsRefresh, true)

  store.invalidateCatalogs(
    "project-a",
    current.catalogIdentity,
    "version-2",
    "invalidate"
  )
  const invalidated = store.getState(key)
  assert.equal(invalidated.catalog, current)
  assert.equal(invalidated.catalogInvalidated, true)
  assert.equal(invalidated.catalogNeedsRefresh, false)
})

test("a repeated invalidation notifies providers and fences the first catalog GET", async () => {
  const store = createSessionExtensionStore()
  const key = sessionExtensionStoreKey("session-a", "runtime-a")
  store.registerTarget(key, "project-a")
  store.seedCatalog(key, catalog("project-a", true, 1))
  let notifications = 0
  store.subscribeState(key, () => notifications++)
  const first = deferred<WebUiExtensionCatalogView>()
  const second = deferred<WebUiExtensionCatalogView>()
  let reads = 0

  store.invalidateCatalogs("project-a", undefined, undefined, "invalidate")
  const firstLoad = store.loadCatalog(
    key,
    () => {
      reads += 1
      return first.promise
    },
    { force: true }
  )
  const firstRevision = store.getState(key).catalogInvalidationRevision
  store.invalidateCatalogs("project-a", undefined, undefined, "invalidate")
  const secondRevision = store.getState(key).catalogInvalidationRevision
  const secondLoad = store.loadCatalog(
    key,
    () => {
      reads += 1
      return second.promise
    },
    { force: true }
  )

  assert.equal(secondRevision, firstRevision + 1)
  assert.equal(notifications >= 2, true)
  assert.equal(reads, 2)
  first.resolve(catalog("project-a", true, 2))
  await firstLoad
  assert.equal(store.getState(key).catalogInvalidated, true)
  assert.equal(store.getState(key).catalog?.projectTrusted, true)

  second.resolve(catalog("project-a", false, 3))
  await secondLoad
  assert.equal(store.getState(key).catalogInvalidated, false)
  assert.equal(store.getState(key).catalog?.projectTrusted, false)
})

test("retained view snapshots evict least-recently-used inactive sessions", () => {
  const store = createSessionExtensionStore()
  const keys = Array.from({ length: 49 }, (_, index) =>
    sessionExtensionStoreKey(`session-${index}`, `runtime-${index}`)
  )
  keys.forEach((key, index) => {
    const instanceId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    store.seedViews(key, [view(instanceId, 1, { index })])
  })

  assert.equal(store.getViewIds(keys[0]!, "composer.above").length, 0)
  assert.equal(store.getViewIds(keys.at(-1)!, "composer.above").length, 1)
})
