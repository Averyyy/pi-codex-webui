import assert from "node:assert/strict"
import test from "node:test"

import {
  configPatchSchema,
  configSchema,
  DEFAULT_CONFIG,
  mergeConfig,
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

test("settings patches reject unsupported and out-of-range values", () => {
  assert.throws(() => configPatchSchema.parse({ server: { host: "0.0.0.0" } }))
  assert.throws(() => configPatchSchema.parse({ appearance: { fontSize: 30 } }))
})
