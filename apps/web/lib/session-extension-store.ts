import type {
  WebUiPlacement,
  WebUiViewEvent,
  WebUiViewSnapshot,
} from "@workspace/runtime-protocol"

import type { WebUiExtensionCatalogView } from "@/lib/webui-extensions/types"

export type SessionExtensionKey = string

export function sessionExtensionStoreKey(
  sessionId: string,
  identityKey: string
) {
  return JSON.stringify([sessionId, identityKey])
}

export interface SessionExtensionPublicState {
  catalog: WebUiExtensionCatalogView | null
  catalogError: string | null
  catalogInvalidated: boolean
  catalogNeedsRefresh: boolean
  catalogInvalidationRevision: number
  viewsError: string | null
  viewsNeedsRefresh: boolean
  viewsStatus: "idle" | "loading" | "refreshing" | "ready" | "error"
}

export interface SessionExtensionStore {
  getState(key: SessionExtensionKey): SessionExtensionPublicState
  registerProvider(key: SessionExtensionKey): () => void
  subscribeState(key: SessionExtensionKey, listener: () => void): () => void
  getViewIds(
    key: SessionExtensionKey,
    placement: WebUiPlacement
  ): readonly string[]
  subscribePlacement(
    key: SessionExtensionKey,
    placement: WebUiPlacement,
    listener: () => void
  ): () => void
  getView(
    key: SessionExtensionKey,
    instanceId: string
  ): WebUiViewSnapshot | null
  subscribeView(
    key: SessionExtensionKey,
    instanceId: string,
    listener: () => void
  ): () => void
  getViewById(
    key: SessionExtensionKey,
    viewId: string
  ): WebUiViewSnapshot | null
  subscribeViewId(
    key: SessionExtensionKey,
    viewId: string,
    listener: () => void
  ): () => void
  getReplacementKeys(key: SessionExtensionKey): ReadonlySet<string>
  subscribeReplacementKeys(
    key: SessionExtensionKey,
    listener: () => void
  ): () => void
  hasReplacementEntry(key: SessionExtensionKey, entryId: string): boolean
  subscribeReplacementEntry(
    key: SessionExtensionKey,
    entryId: string,
    listener: () => void
  ): () => void
  seedCatalog(
    key: SessionExtensionKey,
    catalog: WebUiExtensionCatalogView
  ): void
  setCatalogError(key: SessionExtensionKey, error: string): void
  setViewsError(key: SessionExtensionKey, error: string): void
  registerTarget(key: SessionExtensionKey, projectId: string | null): void
  invalidateCatalogs(
    projectId: string | null,
    catalogIdentity?: string,
    catalogVersion?: string,
    kind?: "data-refresh" | "invalidate"
  ): void
  seedViews(key: SessionExtensionKey, views: WebUiViewSnapshot[]): void
  loadCatalog(
    key: SessionExtensionKey,
    loader: () => Promise<WebUiExtensionCatalogView>,
    options?: { force?: boolean }
  ): Promise<void>
  loadViews(
    key: SessionExtensionKey,
    loader: () => Promise<WebUiViewSnapshot[]>,
    options?: { force?: boolean }
  ): Promise<void>
  applyViewEvent(key: SessionExtensionKey, event: WebUiViewEvent): void
  beginRuntimeGeneration(key: SessionExtensionKey): void
  endRuntimeGeneration(key: SessionExtensionKey): void
}

export async function loadSessionExtensionViewsAfterCheckpoint(
  store: SessionExtensionStore,
  key: SessionExtensionKey,
  waitForCheckpoint: () => Promise<unknown>,
  loader: () => Promise<WebUiViewSnapshot[]>,
  options?: { force?: boolean },
  isCurrent: () => boolean = () => true
) {
  await waitForCheckpoint()
  if (!isCurrent()) return
  await store.loadViews(key, loader, options)
}

export const EMPTY_SESSION_EXTENSION_STATE: SessionExtensionPublicState =
  Object.freeze({
    catalog: null,
    catalogError: null,
    catalogInvalidated: false,
    catalogNeedsRefresh: false,
    catalogInvalidationRevision: 0,
    viewsError: null,
    viewsNeedsRefresh: false,
    viewsStatus: "idle",
  })

const EMPTY_VIEW_IDS: readonly string[] = Object.freeze([])
const EMPTY_REPLACEMENT_KEYS: ReadonlySet<string> = new Set()
const MAX_SESSION_EXTENSION_ENTRIES = 48
const placements: readonly WebUiPlacement[] = [
  "session.header",
  "session.toolbar",
  "conversation.before",
  "conversation.after",
  "composer.above",
  "composer.actions",
  "composer.below",
  "session.rightPanel",
  "session.dialog",
  "session.overlay",
]

interface Entry {
  state: SessionExtensionPublicState
  projectId: string | null
  views: Map<string, WebUiViewSnapshot>
  placementIds: Map<WebUiPlacement, readonly string[]>
  viewIds: Map<string, readonly string[]>
  replacementKeys: ReadonlySet<string>
  replacementEntryIds: Set<string>
  stateListeners: Set<() => void>
  placementListeners: Map<WebUiPlacement, Set<() => void>>
  viewListeners: Map<string, Set<() => void>>
  viewIdListeners: Map<string, Set<() => void>>
  replacementKeyListeners: Set<() => void>
  replacementEntryListeners: Map<string, Set<() => void>>
  viewBuffers: Set<WebUiViewEvent[]>
  viewGeneration: number
  viewSequence: number
  viewFlight: Promise<void> | null
  catalogSequence: number
  catalogFlight: Promise<void> | null
  activeProviders: number
  lastAccess: number
}

function createEntry(): Entry {
  return {
    state: EMPTY_SESSION_EXTENSION_STATE,
    projectId: null,
    views: new Map(),
    placementIds: new Map(),
    viewIds: new Map(),
    replacementKeys: EMPTY_REPLACEMENT_KEYS,
    replacementEntryIds: new Set(),
    stateListeners: new Set(),
    placementListeners: new Map(),
    viewListeners: new Map(),
    viewIdListeners: new Map(),
    replacementKeyListeners: new Set(),
    replacementEntryListeners: new Map(),
    viewBuffers: new Set(),
    viewGeneration: 0,
    viewSequence: 0,
    viewFlight: null,
    catalogSequence: 0,
    catalogFlight: null,
    activeProviders: 0,
    lastAccess: 0,
  }
}

function replacementKey(customType: string, timestamp: number) {
  return JSON.stringify([customType, timestamp])
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((value, index) => value === right[index]))
  )
}

function eventIsNewer(
  current: WebUiViewSnapshot | undefined,
  next: WebUiViewSnapshot
) {
  return current === undefined || next.revision >= current.revision
}

export function createSessionExtensionStore(): SessionExtensionStore {
  const entries = new Map<SessionExtensionKey, Entry>()
  let accessSequence = 0

  function touch(entry: Entry) {
    entry.lastAccess = ++accessSequence
  }

  function hasSubscribers(entry: Entry) {
    return (
      entry.stateListeners.size > 0 ||
      [...entry.placementListeners.values()].some(
        (listeners) => listeners.size > 0
      ) ||
      [...entry.viewListeners.values()].some(
        (listeners) => listeners.size > 0
      ) ||
      [...entry.viewIdListeners.values()].some(
        (listeners) => listeners.size > 0
      ) ||
      entry.replacementKeyListeners.size > 0 ||
      [...entry.replacementEntryListeners.values()].some(
        (listeners) => listeners.size > 0
      )
    )
  }

  function trimEntries(protectedKey: SessionExtensionKey) {
    if (entries.size <= MAX_SESSION_EXTENSION_ENTRIES) return
    const idle = [...entries.entries()]
      .filter(
        ([key, entry]) =>
          key !== protectedKey &&
          entry.activeProviders === 0 &&
          !entry.viewFlight &&
          !entry.catalogFlight &&
          !hasSubscribers(entry)
      )
      .sort(([, left], [, right]) => left.lastAccess - right.lastAccess)
    while (entries.size > MAX_SESSION_EXTENSION_ENTRIES && idle.length > 0) {
      const [key, entry] = idle.shift()!
      if (entries.get(key) === entry) entries.delete(key)
    }
  }

  function entryFor(key: SessionExtensionKey) {
    let entry = entries.get(key)
    if (!entry) {
      entry = createEntry()
      entries.set(key, entry)
    }
    touch(entry)
    trimEntries(key)
    return entry
  }

  function setState(
    entry: Entry,
    update: Partial<SessionExtensionPublicState>
  ) {
    const next = { ...entry.state, ...update }
    if (
      next.catalog === entry.state.catalog &&
      next.catalogError === entry.state.catalogError &&
      next.catalogInvalidated === entry.state.catalogInvalidated &&
      next.catalogNeedsRefresh === entry.state.catalogNeedsRefresh &&
      next.catalogInvalidationRevision ===
        entry.state.catalogInvalidationRevision &&
      next.viewsError === entry.state.viewsError &&
      next.viewsNeedsRefresh === entry.state.viewsNeedsRefresh &&
      next.viewsStatus === entry.state.viewsStatus
    ) {
      return
    }
    entry.state = next
    for (const listener of entry.stateListeners) listener()
  }

  function updateViews(
    entry: Entry,
    nextViews: Map<string, WebUiViewSnapshot>
  ) {
    const previousViews = entry.views
    const changedViewIds = new Set<string>([
      ...previousViews.keys(),
      ...nextViews.keys(),
    ])
    for (const instanceId of [...changedViewIds]) {
      if (previousViews.get(instanceId) === nextViews.get(instanceId)) {
        changedViewIds.delete(instanceId)
      }
    }

    const nextPlacementIds = new Map<WebUiPlacement, readonly string[]>()
    const nextViewIds = new Map<string, readonly string[]>()
    const nextReplacementKeys = new Set<string>()
    const nextReplacementEntryIds = new Set<string>()
    for (const placement of placements) {
      nextPlacementIds.set(placement, [])
    }
    for (const view of nextViews.values()) {
      const ids = nextPlacementIds.get(view.placement) ?? []
      nextPlacementIds.set(view.placement, [...ids, view.instanceId])
      const byViewId = nextViewIds.get(view.viewId) ?? []
      nextViewIds.set(view.viewId, [...byViewId, view.instanceId])
      if (view.replacesEntry) {
        nextReplacementKeys.add(
          replacementKey(
            view.replacesEntry.customType,
            view.replacesEntry.messageTimestamp
          )
        )
        nextReplacementEntryIds.add(view.replacesEntry.entryId)
      }
    }

    const changedPlacements = new Set<WebUiPlacement>()
    for (const placement of placements) {
      const previous = entry.placementIds.get(placement) ?? EMPTY_VIEW_IDS
      const next = nextPlacementIds.get(placement) ?? EMPTY_VIEW_IDS
      if (sameIds(previous, next)) nextPlacementIds.set(placement, previous)
      else changedPlacements.add(placement)
    }
    const changedViewIdGroups = new Set<string>()
    for (const viewId of new Set([
      ...entry.viewIds.keys(),
      ...nextViewIds.keys(),
    ])) {
      const previous = entry.viewIds.get(viewId) ?? EMPTY_VIEW_IDS
      const next = nextViewIds.get(viewId) ?? EMPTY_VIEW_IDS
      if (sameIds(previous, next)) nextViewIds.set(viewId, previous)
      else changedViewIdGroups.add(viewId)
    }
    for (const instanceId of changedViewIds) {
      const previousView = previousViews.get(instanceId)
      const nextView = nextViews.get(instanceId)
      const viewId = nextView?.viewId ?? previousView?.viewId
      if (
        viewId &&
        (entry.viewIds.get(viewId)?.[0] === instanceId ||
          nextViewIds.get(viewId)?.[0] === instanceId)
      ) {
        changedViewIdGroups.add(viewId)
      }
    }
    const previousReplacementKeys = entry.replacementKeys
    const replacementKeysChanged =
      previousReplacementKeys.size !== nextReplacementKeys.size ||
      [...previousReplacementKeys].some((key) => !nextReplacementKeys.has(key))
    const previousReplacementEntryIds = entry.replacementEntryIds
    const changedReplacementEntryIds = new Set([
      ...previousReplacementEntryIds,
      ...nextReplacementEntryIds,
    ])
    for (const id of [...changedReplacementEntryIds]) {
      if (
        previousReplacementEntryIds.has(id) === nextReplacementEntryIds.has(id)
      ) {
        changedReplacementEntryIds.delete(id)
      }
    }

    entry.views = nextViews
    entry.placementIds = nextPlacementIds
    entry.viewIds = nextViewIds
    entry.replacementKeys = replacementKeysChanged
      ? nextReplacementKeys
      : previousReplacementKeys
    entry.replacementEntryIds = nextReplacementEntryIds

    for (const instanceId of changedViewIds) {
      for (const listener of entry.viewListeners.get(instanceId) ?? [])
        listener()
    }
    for (const placement of changedPlacements) {
      for (const listener of entry.placementListeners.get(placement) ?? [])
        listener()
    }
    for (const viewId of changedViewIdGroups) {
      for (const listener of entry.viewIdListeners.get(viewId) ?? []) listener()
    }
    if (replacementKeysChanged) {
      for (const listener of entry.replacementKeyListeners) listener()
    }
    for (const entryId of changedReplacementEntryIds) {
      for (const listener of entry.replacementEntryListeners.get(entryId) ??
        []) {
        listener()
      }
    }
  }

  function applyEventToMap(
    current: Map<string, WebUiViewSnapshot>,
    event: WebUiViewEvent
  ) {
    const next = new Map(current)
    if (event.kind === "close") {
      next.delete(event.instanceId)
      return next
    }
    const view = event.view
    if (eventIsNewer(current.get(view.instanceId), view)) {
      next.set(view.instanceId, view)
    }
    return next
  }

  function loadViews(
    key: SessionExtensionKey,
    loader: () => Promise<WebUiViewSnapshot[]>,
    options: { force?: boolean } = {}
  ) {
    const entry = entryFor(key)
    if (entry.viewFlight) return entry.viewFlight
    if (!options.force && entry.state.viewsStatus === "ready") {
      return Promise.resolve()
    }
    const generation = entry.viewGeneration
    const sequence = ++entry.viewSequence
    const pendingEvents: WebUiViewEvent[] = []
    entry.viewBuffers.add(pendingEvents)
    setState(entry, {
      viewsStatus: entry.views.size ? "refreshing" : "loading",
      viewsError: null,
    })
    const flight = loader()
      .then((snapshots) => {
        if (
          generation !== entry.viewGeneration ||
          sequence !== entry.viewSequence
        ) {
          return
        }
        let next = new Map<string, WebUiViewSnapshot>()
        for (const snapshot of snapshots) {
          const existing = next.get(snapshot.instanceId)
          if (eventIsNewer(existing, snapshot))
            next.set(snapshot.instanceId, snapshot)
        }
        for (const event of pendingEvents) next = applyEventToMap(next, event)
        updateViews(entry, next)
        setState(entry, {
          viewsStatus: "ready",
          viewsError: null,
          viewsNeedsRefresh: false,
        })
      })
      .catch((failure: unknown) => {
        if (
          generation === entry.viewGeneration &&
          sequence === entry.viewSequence
        ) {
          setState(entry, {
            viewsStatus: "error",
            viewsError:
              failure instanceof Error ? failure.message : String(failure),
            viewsNeedsRefresh: true,
          })
        }
        throw failure
      })
      .finally(() => {
        entry.viewBuffers.delete(pendingEvents)
        if (entry.viewFlight === flight) entry.viewFlight = null
      })
    entry.viewFlight = flight
    return flight
  }

  function loadCatalog(
    key: SessionExtensionKey,
    loader: () => Promise<WebUiExtensionCatalogView>,
    options: { force?: boolean } = {}
  ) {
    const entry = entryFor(key)
    if (entry.catalogFlight) return entry.catalogFlight
    if (
      !options.force &&
      entry.state.catalog &&
      !entry.state.catalogInvalidated &&
      !entry.state.catalogNeedsRefresh
    ) {
      return Promise.resolve()
    }
    const sequence = ++entry.catalogSequence
    setState(entry, { catalogError: null })
    const flight = loader()
      .then((catalog) => {
        if (sequence !== entry.catalogSequence) return
        const current = entry.state.catalog
        if (
          current &&
          current.catalogIdentity === catalog.catalogIdentity &&
          catalog.revision < current.revision
        ) {
          return
        }
        setState(entry, {
          catalog,
          catalogError: catalog.refreshError ?? null,
          catalogInvalidated: false,
          catalogNeedsRefresh: false,
        })
      })
      .catch((failure: unknown) => {
        if (sequence === entry.catalogSequence) {
          setState(entry, {
            catalogError:
              failure instanceof Error ? failure.message : String(failure),
          })
        }
        throw failure
      })
      .finally(() => {
        if (entry.catalogFlight === flight) entry.catalogFlight = null
      })
    entry.catalogFlight = flight
    return flight
  }

  return {
    getState(key) {
      const entry = entries.get(key)
      if (!entry) return EMPTY_SESSION_EXTENSION_STATE
      touch(entry)
      return entry.state
    },
    registerProvider(key) {
      const entry = entryFor(key)
      entry.activeProviders += 1
      let released = false
      return () => {
        if (released) return
        released = true
        entry.activeProviders = Math.max(0, entry.activeProviders - 1)
        if (
          entry.activeProviders === 0 &&
          entry.state.viewsStatus === "ready"
        ) {
          setState(entry, { viewsNeedsRefresh: true })
        }
      }
    },
    subscribeState(key, listener) {
      const entry = entryFor(key)
      entry.stateListeners.add(listener)
      return () => entry.stateListeners.delete(listener)
    },
    getViewIds(key, placement) {
      const entry = entries.get(key)
      if (!entry) return EMPTY_VIEW_IDS
      touch(entry)
      return entry.placementIds.get(placement) ?? EMPTY_VIEW_IDS
    },
    subscribePlacement(key, placement, listener) {
      const entry = entryFor(key)
      let listenersForPlacement = entry.placementListeners.get(placement)
      if (!listenersForPlacement) {
        listenersForPlacement = new Set()
        entry.placementListeners.set(placement, listenersForPlacement)
      }
      listenersForPlacement.add(listener)
      return () => {
        listenersForPlacement?.delete(listener)
        if (listenersForPlacement?.size === 0) {
          entry.placementListeners.delete(placement)
        }
      }
    },
    getView(key, instanceId) {
      const entry = entries.get(key)
      if (!entry) return null
      touch(entry)
      return entry.views.get(instanceId) ?? null
    },
    subscribeView(key, instanceId, listener) {
      const entry = entryFor(key)
      let viewListeners = entry.viewListeners.get(instanceId)
      if (!viewListeners) {
        viewListeners = new Set()
        entry.viewListeners.set(instanceId, viewListeners)
      }
      viewListeners.add(listener)
      return () => {
        viewListeners?.delete(listener)
        if (viewListeners?.size === 0) entry.viewListeners.delete(instanceId)
      }
    },
    getViewById(key, viewId) {
      const entry = entries.get(key)
      if (entry) touch(entry)
      const instanceId = entry?.viewIds.get(viewId)?.[0]
      return instanceId ? (entry?.views.get(instanceId) ?? null) : null
    },
    subscribeViewId(key, viewId, listener) {
      const entry = entryFor(key)
      let listenersForViewId = entry.viewIdListeners.get(viewId)
      if (!listenersForViewId) {
        listenersForViewId = new Set()
        entry.viewIdListeners.set(viewId, listenersForViewId)
      }
      listenersForViewId.add(listener)
      return () => {
        listenersForViewId?.delete(listener)
        if (listenersForViewId?.size === 0) entry.viewIdListeners.delete(viewId)
      }
    },
    getReplacementKeys(key) {
      const entry = entries.get(key)
      if (!entry) return EMPTY_REPLACEMENT_KEYS
      touch(entry)
      return entry.replacementKeys
    },
    subscribeReplacementKeys(key, listener) {
      const entry = entryFor(key)
      entry.replacementKeyListeners.add(listener)
      return () => entry.replacementKeyListeners.delete(listener)
    },
    hasReplacementEntry(key, entryId) {
      const entry = entries.get(key)
      if (!entry) return false
      touch(entry)
      return entry.replacementEntryIds.has(entryId)
    },
    subscribeReplacementEntry(key, entryId, listener) {
      const entry = entryFor(key)
      let entryListeners = entry.replacementEntryListeners.get(entryId)
      if (!entryListeners) {
        entryListeners = new Set()
        entry.replacementEntryListeners.set(entryId, entryListeners)
      }
      entryListeners.add(listener)
      return () => {
        entryListeners?.delete(listener)
        if (entryListeners?.size === 0) {
          entry.replacementEntryListeners.delete(entryId)
        }
      }
    },
    seedCatalog(key, catalog) {
      const entry = entryFor(key)
      const current = entry.state.catalog
      if (
        current &&
        current.catalogIdentity === catalog.catalogIdentity &&
        catalog.revision < current.revision
      ) {
        return
      }
      entry.catalogSequence += 1
      entry.catalogFlight = null
      setState(entry, {
        catalog,
        catalogError: catalog.refreshError ?? null,
        catalogInvalidated: false,
        catalogNeedsRefresh: false,
      })
    },
    setCatalogError(key, error) {
      setState(entryFor(key), { catalogError: error })
    },
    setViewsError(key, error) {
      setState(entryFor(key), {
        viewsError: error,
        viewsStatus: "error",
        viewsNeedsRefresh: true,
      })
    },
    registerTarget(key, projectId) {
      entryFor(key).projectId = projectId
    },
    invalidateCatalogs(
      projectId,
      catalogIdentity,
      catalogVersion,
      kind = "invalidate"
    ) {
      for (const entry of entries.values()) {
        if (projectId !== null && entry.projectId !== projectId) continue
        const current = entry.state.catalog
        if (
          kind === "data-refresh" &&
          current &&
          catalogIdentity !== undefined &&
          current.catalogIdentity === catalogIdentity &&
          catalogVersion !== undefined &&
          current.catalogVersion === catalogVersion
        ) {
          continue
        }
        entry.catalogSequence += 1
        entry.catalogFlight = null
        setState(entry, {
          ...(kind === "data-refresh"
            ? { catalogNeedsRefresh: true }
            : {
                catalogInvalidated: true,
                catalogNeedsRefresh: false,
              }),
          catalogInvalidationRevision:
            entry.state.catalogInvalidationRevision + 1,
        })
      }
    },
    seedViews(key, views) {
      const entry = entryFor(key)
      const next = new Map(entry.views)
      for (const view of views) {
        if (eventIsNewer(next.get(view.instanceId), view)) {
          next.set(view.instanceId, view)
        }
      }
      updateViews(entry, next)
      setState(entry, {
        viewsStatus: "ready",
        viewsError: null,
        viewsNeedsRefresh: false,
      })
    },
    loadCatalog,
    loadViews,
    applyViewEvent(key, event) {
      const entry = entryFor(key)
      for (const buffer of entry.viewBuffers) buffer.push(event)
      updateViews(entry, applyEventToMap(entry.views, event))
    },
    beginRuntimeGeneration(key) {
      const entry = entryFor(key)
      entry.viewGeneration += 1
      entry.viewSequence += 1
      entry.viewFlight = null
      entry.viewBuffers.clear()
      updateViews(entry, new Map())
      setState(entry, {
        viewsStatus: "idle",
        viewsError: null,
        viewsNeedsRefresh: false,
      })
    },
    endRuntimeGeneration(key) {
      const entry = entryFor(key)
      entry.viewGeneration += 1
      entry.viewSequence += 1
      entry.viewFlight = null
      entry.viewBuffers.clear()
      updateViews(entry, new Map())
      setState(entry, {
        viewsStatus: "idle",
        viewsError: null,
        viewsNeedsRefresh: false,
      })
    },
  }
}
