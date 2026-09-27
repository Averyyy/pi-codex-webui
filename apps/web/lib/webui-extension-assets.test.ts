import assert from "node:assert/strict"
import test from "node:test"

import {
  commitWebUiAssetLease,
  prepareWebUiAssetLease,
  registerWebUiAsset,
  readWebUiAsset,
  releaseWebUiAssetLease,
  webUiAssetDigest,
  WEBUI_ASSET_RETENTION,
} from "./webui-extensions/asset-resolver.js"

test("re-registering an unpinned digest refreshes its LRU position", async () => {
  const content = Buffer.from("asset")
  const digest = webUiAssetDigest(content)
  registerWebUiAsset("lru-first", digest, "client.mjs", "unused", content)
  registerWebUiAsset("lru-second", digest, "client.mjs", "unused", content)
  registerWebUiAsset("lru-first", digest, "client.mjs", "unused", content)
  for (
    let index = 0;
    index < WEBUI_ASSET_RETENTION.maxEntries - 2;
    index += 1
  ) {
    registerWebUiAsset(
      `lru-fill-${index}`,
      digest,
      "client.mjs",
      "unused",
      content
    )
  }
  registerWebUiAsset("lru-extra", digest, "client.mjs", "unused", content)

  assert.equal(
    (await readWebUiAsset("lru-first", digest, "client.mjs"))?.toString("utf8"),
    "asset"
  )
  assert.equal(await readWebUiAsset("lru-second", digest, "client.mjs"), null)
})

test("invalidating one catalog lease cannot release another catalog's shared digest", async () => {
  const originalNow = Date.now
  let fakeNow = originalNow()
  Date.now = () => fakeNow
  let leaseA: string | null = null
  let leaseB: string | null = null
  try {
    const content = Buffer.from("shared digest bytes")
    const digest = webUiAssetDigest(content)
    const reference = {
      extensionId: "shared-extension",
      digest,
      file: "client.mjs",
      path: "unused",
    }
    registerWebUiAsset(
      reference.extensionId,
      digest,
      reference.file,
      reference.path,
      content
    )
    leaseA = commitWebUiAssetLease(await prepareWebUiAssetLease([reference]))
    leaseB = commitWebUiAssetLease(await prepareWebUiAssetLease([reference]))

    // This preparation represents A's async replacement before its generation
    // check. Invalidating A releases only A's independent lease.
    const staleReplacement = prepareWebUiAssetLease([reference])
    assert.equal(releaseWebUiAssetLease(leaseA), true)
    assert.equal(releaseWebUiAssetLease(leaseA), false)
    await staleReplacement
    fakeNow += WEBUI_ASSET_RETENTION.maxAgeMs + 1

    assert.equal(
      (
        await readWebUiAsset(
          reference.extensionId,
          reference.digest,
          reference.file
        )
      )?.toString("utf8"),
      "shared digest bytes"
    )
  } finally {
    releaseWebUiAssetLease(leaseA)
    releaseWebUiAssetLease(leaseB)
    Date.now = originalNow
  }
})
