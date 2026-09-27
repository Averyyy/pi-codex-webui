import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { realpath } from "node:fs/promises"
import path from "node:path"

import type { WebUiRuntime } from "@pi-web-codex/extension-sdk"

import { loadConfig } from "@/lib/config"
import { emitCatalogMetric } from "@/lib/catalog-metrics"
import {
  getBuiltinWebUiExtensionsRoot,
  getDevelopmentWebUiExtensionPaths,
  getExternalWebUiExtensionsRoot,
  getProjectWebUiExtensionsRoot,
} from "@/lib/app-paths"
import { discoverWebUiExtensions } from "./discovery"
import {
  commitWebUiAssetLease,
  prepareWebUiAssetLease,
  releaseWebUiAssetLease,
  type WebUiAssetReference,
} from "./asset-resolver"
import type {
  WebUiExtensionCatalogView,
  WebUiExtensionGroupView,
  WebUiExtensionPreference,
  WorkerWebUiAdapterDescriptor,
} from "./types"

export const DEFAULT_WEBUI_EXTENSION_PREFERENCE: WebUiExtensionPreference = {
  enabled: true,
  rendering: "native",
  selectedAdapter: null,
}

interface RegistryContext {
  cwd?: string
  projectId?: string | null
  projectTrusted?: boolean
}

type DiscoveryResult = Awaited<ReturnType<typeof discoverWebUiExtensions>>

interface DiscoveryCacheEntry {
  key: string
  sharedRootsKey: string
  canonicalCwd: string | null
  generation: number
  result: DiscoveryResult | null
  discoveryVersion: string | null
  buildPromise: Promise<DiscoveryResult> | null
  refreshPromise: Promise<DiscoveryResult> | null
  refreshError: string | null
  refreshDiagnostics: DiscoveryResult["diagnostics"]
  assetLeaseId: string | null
  lastUsed: number
}

interface RegistryState {
  salt: string
  sequence: number
  pendingDiscoveryCount: number
  entries: Map<string, DiscoveryCacheEntry>
}

const MAX_DISCOVERY_CACHE_ENTRIES = 48
const MAX_PENDING_DISCOVERIES = 16
const globalRegistryState = globalThis as typeof globalThis & {
  __piWebCodexWebUiRegistry?: RegistryState
}
const registryState =
  globalRegistryState.__piWebCodexWebUiRegistry ??
  (globalRegistryState.__piWebCodexWebUiRegistry = {
    salt: randomBytes(32).toString("hex"),
    sequence: 0,
    pendingDiscoveryCount: 0,
    entries: new Map(),
  })

if (
  [...registryState.entries.values()].some(
    (entry) => !("assetLeaseId" in entry)
  )
) {
  registryState.entries.clear()
}
for (const entry of registryState.entries.values()) {
  const legacyEntry = entry as DiscoveryCacheEntry & {
    sharedRootsKey?: string
    refreshDiagnostics?: DiscoveryResult["diagnostics"]
    refreshError?: string | null
    generation?: number
    lastUsed?: number
  }
  legacyEntry.refreshDiagnostics ??= []
  legacyEntry.refreshError ??= null
  legacyEntry.sharedRootsKey ??= "legacy-cache-root-scope"
  legacyEntry.generation ??= 0
  legacyEntry.lastUsed ??= ++registryState.sequence
  legacyEntry.assetLeaseId ??= null
}
registryState.pendingDiscoveryCount = [
  ...registryState.entries.values(),
].filter((entry) => entry.buildPromise || entry.refreshPromise).length

function preference(
  configured:
    | {
        enabled: boolean
        rendering: "native" | "tui"
        selectedAdapter: string | null
      }
    | undefined
): WebUiExtensionPreference {
  return configured
    ? { ...configured }
    : { ...DEFAULT_WEBUI_EXTENSION_PREFERENCE }
}

function opaqueId(value: string) {
  return createHash("sha256")
    .update(registryState.salt)
    .update("\0")
    .update(value)
    .digest("hex")
}

async function canonicalOrResolved(input: string) {
  try {
    return await realpath(input)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") return path.resolve(input)
    throw error
  }
}

async function registryIdentity(context: RegistryContext) {
  const cwd = context.cwd ? await canonicalOrResolved(context.cwd) : null
  const projectTrusted = context.projectTrusted === true && cwd !== null
  const developmentRoots = getDevelopmentWebUiExtensionPaths()
  const roots = [
    getBuiltinWebUiExtensionsRoot(),
    getExternalWebUiExtensionsRoot(),
    ...developmentRoots,
    ...(cwd && projectTrusted ? [getProjectWebUiExtensionsRoot(cwd)] : []),
  ]
  const canonicalRoots = await Promise.all(roots.map(canonicalOrResolved))
  const sharedRootsKey = JSON.stringify(
    canonicalRoots.slice(0, 2 + developmentRoots.length)
  )
  const key = JSON.stringify({
    cwd,
    projectTrusted,
    roots: canonicalRoots,
  })
  return {
    key,
    sharedRootsKey,
    canonicalCwd: cwd,
    catalogIdentity: opaqueId(key),
  }
}

function discoveryVersion(result: DiscoveryResult) {
  const content = {
    extensions: result.extensions.map((candidate) => ({
      key: candidate.key,
      source: candidate.source,
      packageName: candidate.packageName,
      packageVersion: candidate.packageVersion,
      extension: candidate.extension,
      workerPath: candidate.workerPath,
      clientDigest: candidate.client.digest,
      styleDigest: candidate.style?.digest ?? null,
    })),
    diagnostics: result.diagnostics,
  }
  return opaqueId(JSON.stringify(content))
}

function introducedDiagnostics(
  previous: DiscoveryResult,
  next: DiscoveryResult
) {
  const previousDiagnostics = new Set(
    previous.diagnostics.map(({ path, message }) => `${path}\0${message}`)
  )
  return next.diagnostics.filter(
    ({ path, message }) => !previousDiagnostics.has(`${path}\0${message}`)
  )
}

function touchEntry(entry: DiscoveryCacheEntry) {
  entry.lastUsed = ++registryState.sequence
  registryState.entries.delete(entry.key)
  registryState.entries.set(entry.key, entry)
}

function assetReferences(result: DiscoveryResult): WebUiAssetReference[] {
  return result.extensions.flatMap((candidate) => [
    { extensionId: candidate.extension.id, ...candidate.client },
    ...(candidate.style
      ? [{ extensionId: candidate.extension.id, ...candidate.style }]
      : []),
  ])
}

function releaseEntryAssets(entry: DiscoveryCacheEntry) {
  releaseWebUiAssetLease(entry.assetLeaseId)
  entry.assetLeaseId = null
}

async function retainEntryAssets(entry: DiscoveryCacheEntry) {
  if (!entry.result) return false
  if (entry.assetLeaseId !== null) return true
  const result = entry.result
  const generation = entry.generation
  try {
    const prepared = await prepareWebUiAssetLease(assetReferences(result))
    if (entry.generation !== generation || entry.result !== result) {
      return false
    }
    entry.assetLeaseId = commitWebUiAssetLease(prepared)
    return true
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "WebUiAssetSourceChanged" &&
      entry.generation === generation &&
      entry.result === result
    ) {
      entry.result = null
      entry.discoveryVersion = null
      releaseEntryAssets(entry)
      return false
    }
    throw error
  }
}

async function replaceEntryDiscovery(
  entry: DiscoveryCacheEntry,
  result: DiscoveryResult,
  generation: number
) {
  const prepared = await prepareWebUiAssetLease(assetReferences(result))
  if (entry.generation !== generation) {
    throw new Error("WebUI extension discovery was invalidated while running.")
  }
  entry.assetLeaseId = commitWebUiAssetLease(prepared, entry.assetLeaseId)
  entry.result = result
  entry.discoveryVersion = discoveryVersion(result)
}

function trimDiscoveryCache() {
  while (registryState.entries.size > MAX_DISCOVERY_CACHE_ENTRIES) {
    const oldestSettledKey = [...registryState.entries].find(
      ([, entry]) => !entry.buildPromise && !entry.refreshPromise
    )?.[0]
    if (oldestSettledKey === undefined) return
    const entry = registryState.entries.get(oldestSettledKey)
    if (entry) releaseEntryAssets(entry)
    registryState.entries.delete(oldestSettledKey)
  }
}

function entryFor(identity: Awaited<ReturnType<typeof registryIdentity>>) {
  let entry = registryState.entries.get(identity.key)
  if (!entry) {
    entry = {
      key: identity.key,
      sharedRootsKey: identity.sharedRootsKey,
      canonicalCwd: identity.canonicalCwd,
      generation: 0,
      result: null,
      discoveryVersion: null,
      buildPromise: null,
      refreshPromise: null,
      refreshError: null,
      refreshDiagnostics: [],
      assetLeaseId: null,
      lastUsed: ++registryState.sequence,
    }
    registryState.entries.set(entry.key, entry)
    trimDiscoveryCache()
  } else {
    touchEntry(entry)
  }
  return entry
}

function invalidateSiblingCatalogs(entry: DiscoveryCacheEntry) {
  for (const sibling of registryState.entries.values()) {
    if (sibling === entry || sibling.sharedRootsKey !== entry.sharedRootsKey) {
      continue
    }
    sibling.generation += 1
    releaseEntryAssets(sibling)
    sibling.result = null
    sibling.discoveryVersion = null
    sibling.refreshError = null
    sibling.refreshDiagnostics = []
    sibling.buildPromise = null
    sibling.refreshPromise = null
  }
}

async function cachedDiscovery(
  context: RegistryContext,
  forceRefresh = false
): Promise<{
  catalogIdentity: string
  discoveryVersion: string
  result: DiscoveryResult
  refreshError: string | null
  refreshDiagnostics: DiscoveryResult["diagnostics"]
}> {
  const requestStartedAt = Date.now()
  const identity = await registryIdentity(context)
  const entry = entryFor(identity)

  if (entry.result) await retainEntryAssets(entry)

  if (!forceRefresh && entry.result) {
    emitCatalogMetric("webui-extension-discovery", {
      result: "hit",
      forceRefresh,
      durationMs: Date.now() - requestStartedAt,
      extensions: entry.result.extensions.length,
      diagnostics: entry.result.diagnostics.length,
      activeScans: registryState.pendingDiscoveryCount,
    })
    return {
      catalogIdentity: identity.catalogIdentity,
      discoveryVersion: entry.discoveryVersion!,
      result: entry.result,
      refreshError: entry.refreshError,
      refreshDiagnostics: entry.refreshDiagnostics,
    }
  }

  const inFlight = forceRefresh
    ? (entry.refreshPromise ?? entry.buildPromise)
    : (entry.buildPromise ?? entry.refreshPromise)
  if (inFlight) {
    emitCatalogMetric("webui-extension-discovery", {
      result: "singleflight",
      forceRefresh,
      durationMs: Date.now() - requestStartedAt,
      activeScans: registryState.pendingDiscoveryCount,
    })
    const capturedGeneration = entry.generation
    try {
      const result = await inFlight
      if (entry.generation !== capturedGeneration) {
        throw new Error(
          "WebUI extension discovery was invalidated while running."
        )
      }
      if (!entry.result) {
        await replaceEntryDiscovery(entry, result, capturedGeneration)
      }
      return {
        catalogIdentity: identity.catalogIdentity,
        discoveryVersion: entry.discoveryVersion!,
        result: entry.result,
        refreshError: entry.refreshError,
        refreshDiagnostics: entry.refreshDiagnostics,
      }
    } catch (error) {
      if (entry.generation !== capturedGeneration) {
        throw new Error(
          "WebUI extension discovery was invalidated while running."
        )
      }
      if (entry.result) {
        entry.refreshError =
          error instanceof Error ? error.message : String(error)
        return {
          catalogIdentity: identity.catalogIdentity,
          discoveryVersion: entry.discoveryVersion!,
          result: entry.result,
          refreshError: entry.refreshError,
          refreshDiagnostics: entry.refreshDiagnostics,
        }
      }
      throw error
    }
  }

  if (registryState.pendingDiscoveryCount >= MAX_PENDING_DISCOVERIES) {
    throw new Error("WebUI extension discovery is at capacity.")
  }
  const capturedGeneration = entry.generation
  const discovery = discoverWebUiExtensions(context)
  registryState.pendingDiscoveryCount += 1
  if (forceRefresh && entry.result) entry.refreshPromise = discovery
  else entry.buildPromise = discovery
  entry.refreshError = null
  entry.refreshDiagnostics = []
  try {
    const result = await discovery
    if (entry.generation !== capturedGeneration) {
      throw new Error(
        "WebUI extension discovery was invalidated while running."
      )
    }
    if (forceRefresh && entry.result) {
      const newDiagnostics = introducedDiagnostics(entry.result, result)
      if (newDiagnostics.length > 0) {
        entry.refreshDiagnostics = newDiagnostics
        entry.refreshError =
          "One or more extension packages could not be refreshed."
        return {
          catalogIdentity: identity.catalogIdentity,
          discoveryVersion: entry.discoveryVersion!,
          result: entry.result,
          refreshError: entry.refreshError,
          refreshDiagnostics: entry.refreshDiagnostics,
        }
      }
    }
    await replaceEntryDiscovery(entry, result, capturedGeneration)
    entry.refreshDiagnostics = []
    if (forceRefresh) invalidateSiblingCatalogs(entry)
    emitCatalogMetric("webui-extension-discovery", {
      result: forceRefresh ? "refreshed" : "built",
      forceRefresh,
      durationMs: Date.now() - requestStartedAt,
      extensions: result.extensions.length,
      diagnostics: result.diagnostics.length,
      activeScans: registryState.pendingDiscoveryCount,
    })
    return {
      catalogIdentity: identity.catalogIdentity,
      discoveryVersion: entry.discoveryVersion,
      result,
      refreshError: null,
      refreshDiagnostics: [],
    }
  } catch (error) {
    if (entry.generation !== capturedGeneration) {
      throw new Error(
        "WebUI extension discovery was invalidated while running."
      )
    }
    if (entry.result) {
      entry.refreshError =
        error instanceof Error ? error.message : String(error)
      emitCatalogMetric("webui-extension-discovery", {
        result: "refresh-error-preserved",
        forceRefresh,
        durationMs: Date.now() - requestStartedAt,
        extensions: entry.result.extensions.length,
        diagnostics: entry.result.diagnostics.length,
        activeScans: registryState.pendingDiscoveryCount,
      })
      return {
        catalogIdentity: identity.catalogIdentity,
        discoveryVersion: entry.discoveryVersion!,
        result: entry.result,
        refreshError: entry.refreshError,
        refreshDiagnostics: entry.refreshDiagnostics,
      }
    }
    emitCatalogMetric("webui-extension-discovery", {
      result: "error",
      forceRefresh,
      durationMs: Date.now() - requestStartedAt,
      activeScans: registryState.pendingDiscoveryCount,
    })
    throw error
  } finally {
    registryState.pendingDiscoveryCount -= 1
    if (entry.buildPromise === discovery) entry.buildPromise = null
    if (entry.refreshPromise === discovery) entry.refreshPromise = null
    trimDiscoveryCache()
  }
}

export async function invalidateWebUiExtensionCatalog(cwd?: string) {
  if (cwd === undefined) {
    for (const entry of registryState.entries.values()) {
      entry.generation += 1
      releaseEntryAssets(entry)
      entry.result = null
      entry.discoveryVersion = null
      entry.refreshError = null
      entry.refreshDiagnostics = []
    }
    registryState.entries.clear()
    return
  }
  const canonicalCwd = await canonicalOrResolved(cwd)
  for (const [key, entry] of registryState.entries) {
    if (entry.canonicalCwd !== canonicalCwd) continue
    entry.generation += 1
    releaseEntryAssets(entry)
    entry.result = null
    entry.discoveryVersion = null
    entry.refreshError = null
    entry.refreshDiagnostics = []
    registryState.entries.delete(key)
  }
}

export async function webUiExtensionCatalog(
  context: RegistryContext = {},
  options: { refresh?: boolean } = {}
): Promise<WebUiExtensionCatalogView> {
  const [config, discovery] = await Promise.all([
    loadConfig(),
    cachedDiscovery(context, options.refresh ?? false),
  ])
  const groups = new Map<string, WebUiExtensionGroupView>()
  for (const candidate of discovery.result.extensions) {
    const group = groups.get(candidate.extension.id) ?? {
      id: candidate.extension.id,
      name: candidate.extension.name ?? candidate.extension.id,
      preference: preference(
        config.webuiExtensions.preferences[candidate.extension.id]
      ),
      candidates: [],
    }
    group.candidates.push({
      key: candidate.key,
      source: candidate.source,
      packageName: candidate.packageName,
      packageVersion: candidate.packageVersion,
      target: structuredClone(candidate.extension.target),
      runtimes: [...candidate.extension.runtimes],
      client: {
        digest: candidate.client.digest,
        file: candidate.client.file,
        url: candidate.client.url,
      },
      ...(candidate.style
        ? {
            style: {
              digest: candidate.style.digest,
              file: candidate.style.file,
              url: candidate.style.url,
            },
          }
        : {}),
    })
    groups.set(group.id, group)
  }
  for (const group of groups.values()) {
    group.candidates.sort((left, right) => left.key.localeCompare(right.key))
  }
  const catalogVersion = opaqueId(
    JSON.stringify({
      identity: discovery.catalogIdentity,
      discoveryVersion: discovery.discoveryVersion,
      configRevision: config.revision,
      preferences: config.webuiExtensions.preferences,
    })
  )
  return {
    catalogIdentity: discovery.catalogIdentity,
    catalogVersion,
    revision: config.revision,
    projectId: context.projectId ?? null,
    projectTrusted: context.projectTrusted ?? false,
    groups: [...groups.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    diagnostics: discovery.result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
    })),
    statuses: [],
    ...(discovery.refreshError ? { refreshError: discovery.refreshError } : {}),
    ...(discovery.refreshDiagnostics.length
      ? {
          refreshDiagnostics: discovery.refreshDiagnostics.map((item) => ({
            ...item,
          })),
        }
      : {}),
  }
}

export async function webUiAdaptersForRuntime(
  runtime: WebUiRuntime,
  context: RegistryContext = {}
): Promise<WorkerWebUiAdapterDescriptor[]> {
  const [config, discovery] = await Promise.all([
    loadConfig(),
    cachedDiscovery(context),
  ])
  return discovery.result.extensions
    .filter((candidate) => candidate.extension.runtimes.includes(runtime))
    .map((candidate) => ({
      key: candidate.key,
      source: candidate.source,
      packageName: candidate.packageName,
      packageVersion: candidate.packageVersion,
      extension: candidate.extension,
      workerPath: candidate.workerPath,
      preference: preference(
        config.webuiExtensions.preferences[candidate.extension.id]
      ),
    }))
}
