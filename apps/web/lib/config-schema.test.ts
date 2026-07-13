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

test("version 1 settings gain deterministic runtime and MCP defaults", () => {
  const legacy = structuredClone(DEFAULT_CONFIG) as Record<string, unknown>
  legacy.schemaVersion = 1
  delete legacy.developer
  delete legacy.mcp

  const migrated = parseConfig(legacy)
  assert.equal(migrated.schemaVersion, 2)
  assert.deepEqual(migrated.developer, DEFAULT_CONFIG.developer)
  assert.deepEqual(migrated.mcp, DEFAULT_CONFIG.mcp)
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

test("MCP server IDs are explicit namespaces and match their map keys", () => {
  const config = structuredClone(DEFAULT_CONFIG)
  config.mcp.servers.github = {
    id: "github",
    name: "GitHub",
    scope: "global",
    projectId: null,
    enabled: true,
    transport: {
      type: "http",
      url: "https://mcp.example.test/api",
      headers: {},
    },
    env: {},
    timeoutMs: 30_000,
    enabledTools: [],
    disabledTools: ["delete_issue"],
  }
  assert.equal(configSchema.parse(config).mcp.servers.github?.id, "github")

  config.mcp.servers.github.id = "other"
  assert.throws(() => configSchema.parse(config))
})
