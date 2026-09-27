import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"

interface RegisteredAsset {
  digest: string
  content: Buffer
  lastAccessedAt: number
  references: number
}

export interface WebUiAssetReference {
  extensionId: string
  digest: string
  file: string
  path: string
}

const globalState = globalThis as typeof globalThis & {
  __piWebCodexWebUiAssets?: Map<string, RegisteredAsset>
  __piWebCodexWebUiAssetLeases?: Map<string, string[]>
}
const assets =
  globalState.__piWebCodexWebUiAssets ??
  (globalState.__piWebCodexWebUiAssets = new Map())
const assetLeasesWerePresent =
  globalState.__piWebCodexWebUiAssetLeases !== undefined
const assetLeases =
  globalState.__piWebCodexWebUiAssetLeases ??
  (globalState.__piWebCodexWebUiAssetLeases = new Map<string, string[]>())

export const WEBUI_ASSET_RETENTION = {
  maxEntries: 4_096,
  maxBytes: 128 * 1024 * 1024,
  maxAgeMs: 6 * 60 * 60 * 1_000,
} as const
let totalAssetBytes = 0
const leaseReferenceCounts = new Map<string, number>()
for (const keys of assetLeases.values()) {
  for (const key of new Set(keys)) {
    leaseReferenceCounts.set(key, (leaseReferenceCounts.get(key) ?? 0) + 1)
  }
}

for (const [key, asset] of assets) {
  const legacyAsset = asset as RegisteredAsset & { path?: string }
  if (!legacyAsset.content && legacyAsset.path) {
    try {
      const content = readFileSync(legacyAsset.path)
      if (webUiAssetDigest(content) === legacyAsset.digest) {
        legacyAsset.content = Buffer.from(content)
      }
    } catch {
      // An obsolete in-memory path cannot be kept as a valid digest asset.
    }
  }
  if (!legacyAsset.content) {
    assets.delete(key)
    continue
  }
  if (!Buffer.isBuffer(legacyAsset.content)) {
    legacyAsset.content = Buffer.from(legacyAsset.content)
  }
  totalAssetBytes += legacyAsset.content.byteLength
  legacyAsset.lastAccessedAt ??= Date.now()
  legacyAsset.references = assetLeasesWerePresent
    ? (leaseReferenceCounts.get(key) ?? 0)
    : 0
}
const orderedAssets = [...assets.entries()].sort(
  ([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt
)
assets.clear()
for (const [key, asset] of orderedAssets) assets.set(key, asset)

function assetKey(extensionId: string, digest: string, file: string) {
  return `${extensionId}\0${digest}\0${file}`
}

export function webUiAssetDigest(content: Buffer) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16)
}

export function registerWebUiAsset(
  extensionId: string,
  digest: string,
  file: string,
  _assetPath: string,
  content: Buffer
) {
  if (webUiAssetDigest(content) !== digest) {
    throw new Error("WebUI extension asset digest does not match its content.")
  }
  const key = assetKey(extensionId, digest, file)
  const existing = assets.get(key)
  if (existing?.references && !existing.content.equals(content)) {
    throw new Error(
      "A retained WebUI extension asset changed its digest bytes."
    )
  }
  if (existing) {
    totalAssetBytes -= existing.content.byteLength
    assets.delete(key)
  }
  assets.set(key, {
    digest,
    content: Buffer.from(content),
    lastAccessedAt: Date.now(),
    references: existing?.references ?? 0,
  })
  totalAssetBytes += content.byteLength
  evictAssets()
}

export async function readWebUiAsset(
  extensionId: string,
  digest: string,
  file: string
) {
  const key = assetKey(extensionId, digest, file)
  const registered = assets.get(key)
  if (!registered) return null
  if (
    registered.references === 0 &&
    Date.now() - registered.lastAccessedAt > WEBUI_ASSET_RETENTION.maxAgeMs
  ) {
    totalAssetBytes -= registered.content.byteLength
    assets.delete(key)
    return null
  }
  registered.lastAccessedAt = Date.now()
  assets.delete(key)
  assets.set(key, registered)
  if (webUiAssetDigest(registered.content) !== registered.digest) return null
  return Buffer.from(registered.content)
}

export interface PreparedWebUiAssetLease {
  assets: Map<string, { digest: string; content: Buffer }>
}

export async function prepareWebUiAssetLease(
  references: WebUiAssetReference[]
): Promise<PreparedWebUiAssetLease> {
  const next = new Map<string, { digest: string; content: Buffer }>()
  for (const reference of references) {
    const key = assetKey(
      reference.extensionId,
      reference.digest,
      reference.file
    )
    if (next.has(key)) continue
    const registered = assets.get(key)
    let content = registered?.content
    if (!content) {
      content = await readFile(reference.path)
    }
    if (webUiAssetDigest(content) !== reference.digest) {
      const error = new Error(
        "A discovered WebUI extension asset changed before it could be retained."
      )
      error.name = "WebUiAssetSourceChanged"
      throw error
    }
    next.set(key, { digest: reference.digest, content })
  }
  return { assets: next }
}

export function commitWebUiAssetLease(
  prepared: PreparedWebUiAssetLease,
  previousLeaseId?: string | null
) {
  const previousLeaseKeys = previousLeaseId
    ? (assetLeases.get(previousLeaseId) ?? [])
    : []
  const previousLeaseExists =
    previousLeaseId !== undefined &&
    previousLeaseId !== null &&
    assetLeases.has(previousLeaseId)
  const previous = new Set(previousLeaseKeys)
  const nextKeys = new Set(prepared.assets.keys())
  const resultingPinned = new Map<string, Buffer>()
  for (const [key, asset] of assets) {
    const nextReferences =
      asset.references - (previousLeaseExists && previous.has(key) ? 1 : 0)
    if (nextReferences > 0) resultingPinned.set(key, asset.content)
  }
  for (const [key, asset] of prepared.assets) {
    resultingPinned.set(key, asset.content)
  }
  const pinnedBytes = [...resultingPinned.values()].reduce(
    (total, content) => total + content.byteLength,
    0
  )
  if (
    resultingPinned.size > WEBUI_ASSET_RETENTION.maxEntries ||
    pinnedBytes > WEBUI_ASSET_RETENTION.maxBytes
  ) {
    const error = new Error(
      "The active WebUI extension catalogs exceed the bounded asset retention budget."
    )
    error.name = "WebUiAssetRetentionLimit"
    throw error
  }

  for (const key of previous) {
    if (nextKeys.has(key)) continue
    const asset = assets.get(key)
    if (asset && previousLeaseExists) {
      asset.references = Math.max(0, asset.references - 1)
    }
  }
  for (const [key, candidate] of prepared.assets) {
    let asset = assets.get(key)
    const assetExisted = asset !== undefined
    if (!asset) {
      asset = {
        digest: candidate.digest,
        content: candidate.content,
        lastAccessedAt: Date.now(),
        references: 0,
      }
      totalAssetBytes += asset.content.byteLength
      assets.set(key, asset)
    }
    if (!previousLeaseExists || !previous.has(key) || !assetExisted) {
      asset.references += 1
    }
    asset.lastAccessedAt = Date.now()
    assets.delete(key)
    assets.set(key, asset)
  }
  if (previousLeaseId && previousLeaseExists) {
    assetLeases.delete(previousLeaseId)
  }
  const leaseId = randomUUID()
  assetLeases.set(leaseId, [...nextKeys])
  evictAssets()
  return leaseId
}

export function releaseWebUiAssetLease(leaseId: string | null | undefined) {
  if (!leaseId) return false
  const keys = assetLeases.get(leaseId)
  if (!keys) return false
  assetLeases.delete(leaseId)
  for (const key of new Set(keys)) {
    const asset = assets.get(key)
    if (asset) asset.references = Math.max(0, asset.references - 1)
  }
  evictAssets()
  return true
}

function evictAssets() {
  const now = Date.now()
  for (const [key, asset] of [...assets]) {
    if (
      asset.references > 0 ||
      now - asset.lastAccessedAt <= WEBUI_ASSET_RETENTION.maxAgeMs
    ) {
      continue
    }
    totalAssetBytes -= asset.content.byteLength
    assets.delete(key)
  }
  while (
    assets.size > WEBUI_ASSET_RETENTION.maxEntries ||
    totalAssetBytes > WEBUI_ASSET_RETENTION.maxBytes
  ) {
    const oldest = [...assets].find(([, asset]) => asset.references === 0) as
      [string, RegisteredAsset] | undefined
    if (!oldest) return
    assets.delete(oldest[0])
    totalAssetBytes -= oldest[1].content.byteLength
  }
}

export function webUiAssetContentType(file: string) {
  if (file.endsWith(".css")) return "text/css; charset=utf-8"
  if (file.endsWith(".js") || file.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8"
  }
  return "application/octet-stream"
}
