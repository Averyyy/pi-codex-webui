import assert from "node:assert/strict"
import test from "node:test"

import {
  configPatchSchema,
  configSchema,
  DEFAULT_CONFIG,
  mergeConfig,
  parseConfig,
} from "./config-schema"

test("settings patches preserve authority boundaries", () => {
  const patch = configPatchSchema.parse({
    appearance: { theme: "dark", sidebarWidth: 320 },
  })
  const next = mergeConfig(DEFAULT_CONFIG, patch)

  assert.equal(next.appearance.theme, "dark")
  assert.equal(next.appearance.sidebarWidth, 320)
  assert.equal(next.server.host, "127.0.0.1")
  assert.deepEqual(configSchema.parse(next), next)
})

test("legacy settings gain deterministic runtime defaults", () => {
  const legacy = structuredClone(DEFAULT_CONFIG) as Record<string, unknown>
  delete legacy.developer

  assert.deepEqual(parseConfig(legacy).developer, DEFAULT_CONFIG.developer)
})

test("settings patches reject unsupported and out-of-range values", () => {
  assert.throws(() => configPatchSchema.parse({ server: { host: "0.0.0.0" } }))
  assert.throws(() => configPatchSchema.parse({ appearance: { fontSize: 30 } }))
})

test("runtime defaults can only select enabled profiles", () => {
  const disabledClientDefault = structuredClone(DEFAULT_CONFIG)
  disabledClientDefault.developer.runtime.default = "pi-client-default"
  assert.throws(() => configSchema.parse(disabledClientDefault))

  const client =
    disabledClientDefault.developer.runtime.profiles["pi-client-default"]
  assert.ok(client?.kind === "pi-client")
  client.enabled = true
  assert.deepEqual(
    configSchema.parse(disabledClientDefault).developer.runtime,
    disabledClientDefault.developer.runtime
  )
})
