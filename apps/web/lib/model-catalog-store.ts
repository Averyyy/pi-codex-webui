import type { ModelSettings } from "@workspace/runtime-protocol"

import { responseJson } from "@/lib/api-response"
import { modelCatalogSnapshotSchema } from "@/lib/model-catalog-schema"
import { measurePerformance } from "@/lib/performance-diagnostics"
import { projectEnabledModelSettings } from "@/lib/model-settings-projection"

export type ModelCatalogScope = "all" | "enabled"

export interface ModelCatalogTarget {
  sessionId?: string
  projectId?: string
  newTask?: boolean
  defaultTarget?: boolean
}

export interface ModelCatalogSnapshot extends ModelSettings {
  catalogIdentity: string
  catalogVersion: string
}

export interface ModelCatalogState {
  snapshot: ModelCatalogSnapshot | null
  catalogIdentity: string | null
  status: "idle" | "loading" | "ready" | "refreshing" | "error"
  error: string | null
}

export interface ModelCatalogStore {
  getState(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope
  ): ModelCatalogState
  subscribe(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    listener: () => void
  ): () => void
  load(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    options?: { force?: boolean }
  ): Promise<ModelCatalogSnapshot>
  publish(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    snapshot: ModelCatalogSnapshot
  ): void
  invalidate(target: ModelCatalogTarget, scope: ModelCatalogScope): boolean
  invalidateAll(): Array<{
    target: ModelCatalogTarget
    scope: ModelCatalogScope
  }>
  invalidateIdentity(
    catalogIdentity: string,
    catalogVersion?: string
  ): Array<{ target: ModelCatalogTarget; scope: ModelCatalogScope }>
  revalidateIdentity(
    catalogIdentity: string,
    catalogVersion: string
  ): Array<{ target: ModelCatalogTarget; scope: ModelCatalogScope }>
  refresh(
    target: ModelCatalogTarget,
    mutationToken: string
  ): Promise<ModelCatalogSnapshot>
  beginMutation(target: ModelCatalogTarget, scope: ModelCatalogScope): number
  publishMutation(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    token: number,
    snapshot: ModelCatalogSnapshot
  ): boolean
  finishMutation(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    token: number
  ): void
}

export const EMPTY_MODEL_CATALOG_STATE: ModelCatalogState = Object.freeze({
  snapshot: null,
  catalogIdentity: null,
  status: "idle",
  error: null,
})

const MAX_IDLE_IDENTITIES = 32
const MAX_IDLE_ALIASES = 64

function selectorKey(target: ModelCatalogTarget) {
  const hasSession = target.sessionId !== undefined
  const hasProject = target.projectId !== undefined
  const hasNewTask = target.newTask === true
  const hasDefault = target.defaultTarget === true
  if (
    Number(hasSession) +
      Number(hasProject) +
      Number(hasNewTask) +
      Number(hasDefault) !==
    1
  ) {
    throw new Error("A model catalog target must have exactly one selector.")
  }
  if (hasSession && !target.sessionId) {
    throw new Error("A model catalog session selector cannot be empty.")
  }
  if (hasProject && !target.projectId) {
    throw new Error("A model catalog project selector cannot be empty.")
  }
  return hasSession
    ? ["session", target.sessionId]
    : hasProject
      ? ["project", target.projectId]
      : hasNewTask
        ? ["new-task"]
        : ["default"]
}

function requestKey(target: ModelCatalogTarget, scope: ModelCatalogScope) {
  return JSON.stringify([scope, selectorKey(target)])
}

function queryString(target: ModelCatalogTarget, scope?: ModelCatalogScope) {
  const params = new URLSearchParams()
  if (target.sessionId !== undefined) {
    params.set("sessionId", target.sessionId)
  } else if (target.projectId !== undefined) {
    params.set("projectId", target.projectId)
  } else if (target.newTask === true) {
    params.set("newTask", "1")
  } else if (target.defaultTarget !== true) {
    throw new Error("A model catalog target must have exactly one selector.")
  }
  if (scope) params.set("scope", scope)
  return params.toString()
}

function identityKey(snapshot: ModelCatalogSnapshot, scope: ModelCatalogScope) {
  return JSON.stringify([scope, snapshot.catalogIdentity])
}

interface Entry {
  state: ModelCatalogState
  aliases: Set<string>
  identity: string | null
  expectedVersion: string | null
  inFlight: Promise<ModelCatalogSnapshot> | null
  refreshFlight: Promise<ModelCatalogSnapshot> | null
  latestRequest: number
  latestAppliedRequest: number
  lastAccess: number
  mutationEpoch: number
  pendingMutations: Set<number>
}

function createEntry(alias: string): Entry {
  return {
    state: EMPTY_MODEL_CATALOG_STATE,
    aliases: new Set([alias]),
    identity: null,
    expectedVersion: null,
    inFlight: null,
    refreshFlight: null,
    latestRequest: 0,
    latestAppliedRequest: 0,
    lastAccess: 0,
    mutationEpoch: 0,
    pendingMutations: new Set(),
  }
}

export function createModelCatalogStore(): ModelCatalogStore {
  const byRequest = new Map<string, Entry>()
  const byIdentity = new Map<string, Entry>()
  const listeners = new Map<string, Set<() => void>>()
  const targets = new Map<
    string,
    { target: ModelCatalogTarget; scope: ModelCatalogScope }
  >()
  const mutationEntries = new Map<number, { key: string; entry: Entry }>()
  let requestSequence = 0
  let accessSequence = 0

  function touch(entry: Entry) {
    entry.lastAccess = ++accessSequence
  }

  function notify(entry: Entry) {
    for (const alias of entry.aliases) {
      for (const listener of listeners.get(alias) ?? []) listener()
    }
  }

  function pruneIdle() {
    const idleAliases = [...byRequest.entries()]
      .filter(
        ([alias, entry]) =>
          !listeners.get(alias)?.size && !entry.inFlight && !entry.refreshFlight
      )
      .sort(([, left], [, right]) => left.lastAccess - right.lastAccess)
    while (byRequest.size > MAX_IDLE_ALIASES && idleAliases.length > 0) {
      const [alias, entry] = idleAliases.shift()!
      if (byRequest.get(alias) !== entry) continue
      byRequest.delete(alias)
      targets.delete(alias)
      entry.aliases.delete(alias)
      if (entry.aliases.size === 0 && entry.identity) {
        if (byIdentity.get(entry.identity) === entry) {
          byIdentity.delete(entry.identity)
        }
        entry.identity = null
      }
    }

    const idleIdentities = [...byIdentity.entries()]
      .filter(
        ([, entry]) =>
          !entry.inFlight &&
          !entry.refreshFlight &&
          [...entry.aliases].every((alias) => !listeners.get(alias)?.size)
      )
      .sort(([, left], [, right]) => left.lastAccess - right.lastAccess)
    while (byIdentity.size > MAX_IDLE_IDENTITIES && idleIdentities.length > 0) {
      const [identity, entry] = idleIdentities.shift()!
      if (byIdentity.get(identity) !== entry) continue
      byIdentity.delete(identity)
      entry.identity = null
      for (const alias of entry.aliases) {
        if (byRequest.get(alias) === entry) byRequest.delete(alias)
        targets.delete(alias)
      }
      entry.aliases.clear()
    }
  }

  function entryFor(target: ModelCatalogTarget, scope: ModelCatalogScope) {
    const key = requestKey(target, scope)
    targets.set(key, { target: { ...target }, scope })
    let entry = byRequest.get(key)
    if (!entry) {
      entry = createEntry(key)
      byRequest.set(key, entry)
    }
    touch(entry)
    return { key, entry }
  }

  function detachAlias(alias: string, entry: Entry) {
    if (byRequest.get(alias) === entry) byRequest.delete(alias)
    entry.aliases.delete(alias)
    if (entry.aliases.size > 0) return
    if (entry.identity && byIdentity.get(entry.identity) === entry) {
      byIdentity.delete(entry.identity)
    }
    entry.identity = null
  }

  function rebindAlias(alias: string, from: Entry, to: Entry) {
    if (from === to) return
    if (from.refreshFlight && !to.refreshFlight) {
      to.refreshFlight = from.refreshFlight
    }
    detachAlias(alias, from)
    to.aliases.add(alias)
    byRequest.set(alias, to)
    if (from.state.snapshot && from.state.status === "refreshing") {
      from.state = {
        snapshot: from.state.snapshot,
        catalogIdentity: from.state.catalogIdentity,
        status: "ready",
        error: null,
      }
    }
    notify(from)
  }

  function bindSnapshot(
    source: Entry,
    alias: string,
    scope: ModelCatalogScope,
    snapshot: ModelCatalogSnapshot,
    requestId: number,
    moveAllAliases: boolean
  ) {
    const nextIdentity = identityKey(snapshot, scope)
    const preserveIdentityAliases =
      moveAllAliases && source.identity === nextIdentity
    const existing = byIdentity.get(nextIdentity)
    let destination: Entry

    if (existing) {
      destination = existing
    } else if (source.identity === null || source.identity === nextIdentity) {
      destination = source
    } else {
      destination = createEntry(alias)
      destination.aliases.clear()
    }

    const aliasesToMove =
      source === destination
        ? []
        : preserveIdentityAliases
          ? [...source.aliases]
          : [alias]
    for (const movedAlias of aliasesToMove) {
      rebindAlias(movedAlias, source, destination)
    }

    if (source !== destination && source.aliases.size === 0) {
      if (source.identity && byIdentity.get(source.identity) === source) {
        byIdentity.delete(source.identity)
      }
      source.identity = null
    }

    if (destination.identity && destination.identity !== nextIdentity) {
      if (byIdentity.get(destination.identity) === destination) {
        byIdentity.delete(destination.identity)
      }
    }
    destination.identity = nextIdentity
    byIdentity.set(nextIdentity, destination)
    destination.latestRequest = Math.max(destination.latestRequest, requestId)
    touch(destination)
    pruneIdle()
    return destination
  }

  async function fetchSnapshot(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    mutationToken?: string
  ) {
    return measurePerformance(
      mutationToken ? "modelCatalogRefresh" : "modelCatalogRead",
      async () => {
        const endpoint = mutationToken
          ? `/api/v1/model-settings/refresh?${queryString(target)}`
          : `/api/v1/model-settings?${queryString(target, scope)}`
        const response = await fetch(endpoint, {
          method: mutationToken ? "POST" : "GET",
          cache: "no-store",
          ...(mutationToken
            ? { headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken } }
            : {}),
        })
        const parsed = modelCatalogSnapshotSchema.safeParse(
          await responseJson<unknown>(response)
        )
        if (!parsed.success) {
          throw new Error("The model catalog response is invalid.")
        }
        return parsed.data
      }
    )
  }

  function commitSnapshot(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    source: Entry,
    alias: string,
    snapshot: ModelCatalogSnapshot,
    requestId: number,
    moveAllAliases: boolean
  ) {
    const current = byRequest.get(alias)
    if (current && requestId < current.latestRequest) return current

    const destination = bindSnapshot(
      source,
      alias,
      scope,
      snapshot,
      requestId,
      moveAllAliases
    )
    if (requestId >= destination.latestAppliedRequest) {
      destination.latestAppliedRequest = requestId
      destination.expectedVersion = null
      destination.state = {
        snapshot,
        catalogIdentity: snapshot.catalogIdentity,
        status: "ready",
        error: null,
      }
    }
    notify(destination)
    pruneIdle()
    return destination
  }

  async function startRead(
    target: ModelCatalogTarget,
    scope: ModelCatalogScope,
    key: string,
    entry: Entry
  ) {
    const requestId = ++requestSequence
    const mutationEpoch = entry.mutationEpoch
    entry.latestRequest = requestId
    entry.state = {
      snapshot: entry.state.snapshot,
      catalogIdentity: entry.state.catalogIdentity,
      status: entry.state.snapshot ? "refreshing" : "loading",
      error: null,
    }
    notify(entry)

    const operation = fetchSnapshot(target, scope)
      .then(
        (snapshot) => {
          const current = byRequest.get(key)
          if (
            entry.mutationEpoch !== mutationEpoch ||
            entry.pendingMutations.size > 0
          ) {
            return current?.state.snapshot ?? entry.state.snapshot ?? snapshot
          }
          if (current && requestId < current.latestRequest) {
            notify(current)
            if (current.state.snapshot) return current.state.snapshot
            throw new Error(
              "The model catalog changed while this request was in flight."
            )
          }
          if (
            entry.expectedVersion !== null &&
            snapshot.catalogIdentity === entry.state.catalogIdentity &&
            snapshot.catalogVersion !== entry.expectedVersion
          ) {
            entry.state = {
              snapshot: entry.state.snapshot,
              catalogIdentity: entry.state.catalogIdentity,
              status: "error",
              error:
                "The refreshed model catalog version is not available yet.",
            }
            notify(entry)
            throw new Error(
              "The refreshed model catalog version is not available yet."
            )
          }
          const destination = commitSnapshot(
            target,
            scope,
            entry,
            key,
            snapshot,
            requestId,
            false
          )
          return destination.state.snapshot ?? snapshot
        },
        (failure: unknown) => {
          const current = byRequest.get(key) ?? entry
          if (requestId >= current.latestAppliedRequest) {
            current.latestAppliedRequest = requestId
            current.state = {
              snapshot: current.state.snapshot,
              catalogIdentity: current.state.catalogIdentity,
              status: "error",
              error:
                failure instanceof Error ? failure.message : String(failure),
            }
          }
          notify(current)
          throw failure
        }
      )
      .finally(() => {
        if (entry.inFlight === operation) entry.inFlight = null
        const current = byRequest.get(key)
        if (current?.inFlight === operation) current.inFlight = null
        if (current?.state.status === "refreshing" && !current.inFlight) {
          current.state = {
            snapshot: current.state.snapshot,
            catalogIdentity: current.state.catalogIdentity,
            status: current.state.snapshot ? "ready" : "idle",
            error: null,
          }
          notify(current)
        }
        pruneIdle()
      })
    entry.inFlight = operation
    return operation
  }

  async function startRefresh(
    target: ModelCatalogTarget,
    mutationToken: string,
    key: string,
    entry: Entry
  ) {
    const requestId = ++requestSequence
    const mutationEpoch = entry.mutationEpoch
    entry.latestRequest = requestId
    entry.state = {
      snapshot: entry.state.snapshot,
      catalogIdentity: entry.state.catalogIdentity,
      status: entry.state.snapshot ? "refreshing" : "loading",
      error: null,
    }
    notify(entry)

    const operation = fetchSnapshot(target, "all", mutationToken)
      .then(
        (snapshot) => {
          const current = byRequest.get(key)
          if (
            entry.mutationEpoch !== mutationEpoch ||
            entry.pendingMutations.size > 0
          ) {
            if (current?.state.snapshot) return current.state.snapshot
            throw new Error(
              "The model catalog changed while it was refreshing."
            )
          }
          if (current && requestId < current.latestRequest) {
            if (current.state.snapshot) return current.state.snapshot
            throw new Error("The model catalog target changed during refresh.")
          }
          if (
            entry.expectedVersion !== null &&
            snapshot.catalogIdentity === entry.state.catalogIdentity &&
            snapshot.catalogVersion !== entry.expectedVersion
          ) {
            entry.state = {
              snapshot: entry.state.snapshot,
              catalogIdentity: entry.state.catalogIdentity,
              status: "error",
              error:
                "The refreshed model catalog version is not available yet.",
            }
            notify(entry)
            throw new Error(
              "The refreshed model catalog version is not available yet."
            )
          }
          const destination = commitSnapshot(
            target,
            "all",
            entry,
            key,
            snapshot,
            requestId,
            true
          )
          const enabledSnapshot = projectEnabledModelSettings(snapshot)
          thisStore.publish(target, "enabled", enabledSnapshot)
          return destination.state.snapshot ?? snapshot
        },
        (failure: unknown) => {
          const current = byRequest.get(key) ?? entry
          if (requestId >= current.latestAppliedRequest) {
            current.latestAppliedRequest = requestId
            current.state = {
              snapshot: current.state.snapshot,
              catalogIdentity: current.state.catalogIdentity,
              status: "error",
              error:
                failure instanceof Error ? failure.message : String(failure),
            }
          }
          notify(current)
          throw failure
        }
      )
      .finally(() => {
        if (entry.inFlight === operation) entry.inFlight = null
        const current = byRequest.get(key)
        if (current?.inFlight === operation) current.inFlight = null
        if (current?.state.status === "refreshing" && !current.inFlight) {
          current.state = {
            snapshot: current.state.snapshot,
            catalogIdentity: current.state.catalogIdentity,
            status: current.state.snapshot ? "ready" : "idle",
            error: null,
          }
          notify(current)
        }
        pruneIdle()
      })
    entry.inFlight = operation
    return operation
  }

  const thisStore: ModelCatalogStore = {
    getState(target, scope) {
      return (
        byRequest.get(requestKey(target, scope))?.state ??
        EMPTY_MODEL_CATALOG_STATE
      )
    },
    subscribe(target, scope, listener) {
      const key = requestKey(target, scope)
      let subscribers = listeners.get(key)
      if (!subscribers) {
        subscribers = new Set()
        listeners.set(key, subscribers)
      }
      subscribers.add(listener)
      const { entry } = entryFor(target, scope)
      touch(entry)
      return () => {
        subscribers?.delete(listener)
        if (subscribers?.size === 0) listeners.delete(key)
        pruneIdle()
      }
    },
    load(target, scope, options = {}) {
      const { key, entry } = entryFor(target, scope)
      if (entry.refreshFlight) return entry.refreshFlight
      if (entry.inFlight) return entry.inFlight
      if (
        !options.force &&
        entry.state.snapshot &&
        entry.expectedVersion === null
      ) {
        return Promise.resolve(entry.state.snapshot)
      }
      return startRead(target, scope, key, entry)
    },
    publish(target, scope, snapshot) {
      const { key, entry } = entryFor(target, scope)
      if (
        entry.expectedVersion !== null &&
        snapshot.catalogIdentity === entry.state.catalogIdentity &&
        snapshot.catalogVersion !== entry.expectedVersion
      ) {
        entry.state = {
          snapshot: entry.state.snapshot,
          catalogIdentity: entry.state.catalogIdentity,
          status: "error",
          error: "The refreshed model catalog version is not available yet.",
        }
        notify(entry)
        return
      }
      const requestId = ++requestSequence
      entry.latestRequest = requestId
      entry.latestAppliedRequest = requestId
      entry.inFlight = null
      entry.refreshFlight = null
      const destination = commitSnapshot(
        target,
        scope,
        entry,
        key,
        snapshot,
        requestId,
        true
      )
      for (const alias of destination.aliases) byRequest.set(alias, destination)
      if (scope === "all") {
        thisStore.publish(
          target,
          "enabled",
          projectEnabledModelSettings(snapshot)
        )
      }
    },
    beginMutation(target, scope) {
      const { key, entry } = entryFor(target, scope)
      for (const [existingToken, existing] of mutationEntries) {
        if (existing.entry !== entry) continue
        mutationEntries.delete(existingToken)
        entry.pendingMutations.delete(existingToken)
      }
      const token = ++requestSequence
      entry.mutationEpoch = token
      entry.pendingMutations.add(token)
      entry.latestRequest = token
      entry.inFlight = null
      mutationEntries.set(token, { key, entry })
      return token
    },
    publishMutation(target, scope, token, snapshot) {
      const key = requestKey(target, scope)
      const requestEntry = byRequest.get(key)
      const mutationEntry = mutationEntries.get(token)
      if (
        !requestEntry ||
        !mutationEntry ||
        mutationEntry.key !== key ||
        mutationEntry.entry !== requestEntry ||
        requestEntry.mutationEpoch !== token ||
        !requestEntry.pendingMutations.has(token)
      ) {
        return false
      }
      mutationEntries.delete(token)
      requestEntry.pendingMutations.delete(token)
      thisStore.publish(target, scope, snapshot)
      return true
    },
    finishMutation(target, scope, token) {
      const key = requestKey(target, scope)
      const mutationEntry = mutationEntries.get(token)
      mutationEntries.delete(token)
      if (!mutationEntry || mutationEntry.key !== key) return
      mutationEntry.entry.pendingMutations.delete(token)
      const current = byRequest.get(key)
      if (
        current === mutationEntry.entry &&
        current.pendingMutations.size === 0 &&
        current.state.status === "refreshing" &&
        !current.inFlight
      ) {
        current.state = {
          snapshot: current.state.snapshot,
          catalogIdentity: current.state.catalogIdentity,
          status: current.state.snapshot ? "ready" : "idle",
          error: null,
        }
        notify(current)
      }
    },
    invalidate(target, scope) {
      const key = requestKey(target, scope)
      const entry = byRequest.get(key)
      if (!entry) return false
      const active = Boolean(listeners.get(key)?.size)
      const generation = ++requestSequence
      const replacement = createEntry(key)
      replacement.latestRequest = generation
      replacement.latestAppliedRequest = generation
      replacement.state = {
        ...EMPTY_MODEL_CATALOG_STATE,
        catalogIdentity: entry.state.catalogIdentity,
      }
      detachAlias(key, entry)
      byRequest.set(key, replacement)
      notify(entry)
      notify(replacement)
      pruneIdle()
      return active
    },
    invalidateAll() {
      const activeTargets: Array<{
        target: ModelCatalogTarget
        scope: ModelCatalogScope
      }> = []
      for (const [key, entry] of [...byRequest]) {
        const request = targets.get(key)
        if (!request || byRequest.get(key) !== entry) continue
        const active = Boolean(listeners.get(key)?.size)
        const generation = ++requestSequence
        const replacement = createEntry(key)
        replacement.latestRequest = generation
        replacement.latestAppliedRequest = generation
        replacement.state = {
          ...EMPTY_MODEL_CATALOG_STATE,
          catalogIdentity: entry.state.catalogIdentity,
        }
        detachAlias(key, entry)
        byRequest.set(key, replacement)
        notify(entry)
        notify(replacement)
        if (active) activeTargets.push(request)
      }
      pruneIdle()
      return activeTargets
    },
    invalidateIdentity(catalogIdentity, catalogVersion) {
      const activeTargets: Array<{
        target: ModelCatalogTarget
        scope: ModelCatalogScope
      }> = []
      const matchesInvalidatedVersion = (entry: Entry) => {
        const snapshot = entry.state.snapshot
        return (
          entry.state.catalogIdentity === catalogIdentity &&
          (!snapshot ||
            catalogVersion === undefined ||
            snapshot.catalogVersion !== catalogVersion)
        )
      }
      const matchingEntries = new Set([
        ...[...byIdentity.values()].filter(matchesInvalidatedVersion),
        ...[...byRequest.values()].filter(matchesInvalidatedVersion),
      ])
      for (const entry of matchingEntries) {
        for (const alias of [...entry.aliases]) {
          const request = targets.get(alias)
          if (!request || byRequest.get(alias) !== entry) continue
          const active = Boolean(listeners.get(alias)?.size)
          const generation = ++requestSequence
          const replacement = createEntry(alias)
          replacement.latestRequest = generation
          replacement.latestAppliedRequest = generation
          replacement.state = {
            ...EMPTY_MODEL_CATALOG_STATE,
            catalogIdentity: entry.state.catalogIdentity,
          }
          detachAlias(alias, entry)
          byRequest.set(alias, replacement)
          notify(entry)
          notify(replacement)
          if (active) activeTargets.push(request)
        }
      }
      pruneIdle()
      return activeTargets
    },
    revalidateIdentity(catalogIdentity, catalogVersion) {
      const activeTargets: Array<{
        target: ModelCatalogTarget
        scope: ModelCatalogScope
      }> = []
      for (const entry of new Set(byIdentity.values())) {
        const snapshot = entry.state.snapshot
        if (
          snapshot?.catalogIdentity !== catalogIdentity ||
          snapshot.catalogVersion === catalogVersion
        ) {
          continue
        }
        entry.expectedVersion = catalogVersion
        entry.state = {
          snapshot,
          catalogIdentity,
          status: "refreshing",
          error: null,
        }
        notify(entry)
        for (const alias of entry.aliases) {
          const request = targets.get(alias)
          if (request && listeners.get(alias)?.size) activeTargets.push(request)
        }
      }
      return activeTargets
    },
    refresh(target, mutationToken) {
      const { key, entry } = entryFor(target, "all")
      if (entry.refreshFlight) return entry.refreshFlight

      const precedingRead = entry.inFlight
      const refreshOperation = precedingRead
        ? precedingRead
            .catch(() => undefined)
            .then(() => {
              const current = byRequest.get(key) ?? entry
              return startRefresh(target, mutationToken, key, current)
            })
        : startRefresh(target, mutationToken, key, entry)
      const refreshFlight = refreshOperation.finally(() => {
        const current = byRequest.get(key) ?? entry
        if (current.refreshFlight === refreshFlight)
          current.refreshFlight = null
        if (entry.refreshFlight === refreshFlight) entry.refreshFlight = null
        pruneIdle()
      })
      entry.refreshFlight = refreshFlight
      return refreshFlight
    },
  }
  return thisStore
}
