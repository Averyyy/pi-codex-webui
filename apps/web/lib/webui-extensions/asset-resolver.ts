import "server-only"

import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

interface RegisteredAsset {
  digest: string
  path: string
}

const globalState = globalThis as typeof globalThis & {
  __piWebCodexWebUiAssets?: Map<string, RegisteredAsset>
}
const assets =
  globalState.__piWebCodexWebUiAssets ??
  (globalState.__piWebCodexWebUiAssets = new Map())

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
  assetPath: string
) {
  assets.set(assetKey(extensionId, digest, file), {
    digest,
    path: assetPath,
  })
}

export async function readWebUiAsset(
  extensionId: string,
  digest: string,
  file: string
) {
  const registered = assets.get(assetKey(extensionId, digest, file))
  if (!registered) return null
  const content = await readFile(registered.path)
  if (webUiAssetDigest(content) !== registered.digest) return null
  return content
}

export function webUiAssetContentType(file: string) {
  if (file.endsWith(".css")) return "text/css; charset=utf-8"
  if (file.endsWith(".js") || file.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8"
  }
  return "application/octet-stream"
}
