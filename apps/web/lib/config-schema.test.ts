import assert from "node:assert/strict"
import test from "node:test"

import {
  configPatchSchema,
  configSchema,
  DEFAULT_CONFIG,
  mergeConfig,
  parseConfig,
  runtimeSettingsViewSchema,
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

test("legacy settings gain deterministic runtime and WebUI defaults", () => {
  const legacy = structuredClone(DEFAULT_CONFIG) as Record<string, unknown>
  legacy.schemaVersion = 1
  delete legacy.developer
  delete legacy.mcp
  delete (legacy.appearance as Record<string, unknown>).language

  const migrated = parseConfig(legacy)
  assert.equal(migrated.schemaVersion, 3)
  assert.deepEqual(migrated.developer, DEFAULT_CONFIG.developer)
  assert.deepEqual(migrated.webuiExtensions, DEFAULT_CONFIG.webuiExtensions)
  assert.equal(migrated.appearance.language, "zh-CN")
})

test("appearance language accepts both supported locales", () => {
  const patch = configPatchSchema.parse({ appearance: { language: "en-US" } })
  const next = mergeConfig(DEFAULT_CONFIG, patch)
  assert.equal(next.appearance.language, "en-US")
  assert.throws(() =>
    configPatchSchema.parse({ appearance: { language: "fr-FR" } })
  )
})

test("WebUI settings retain inactive MCP migration data through ordinary settings saves", () => {
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    mcp: {
      servers: {
        legacy: {
          transport: { type: "stdio", command: "example" },
          env: { TOKEN: { $secret: "reference" } },
        },
      },
      custom: "retained",
    },
  }
  const parsed = parseConfig(config)
  assert.deepEqual(parsed.mcp, config.mcp)
  const saved = mergeConfig(
    parsed,
    configPatchSchema.parse({ appearance: { theme: "dark" } })
  )
  assert.deepEqual(saved.mcp, config.mcp)
  assert.equal(saved.appearance.theme, "dark")
  assert.throws(() => configPatchSchema.parse({ mcp: config.mcp }))
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

test("runtime settings responses keep revision and default flags coherent", () => {
  const view = {
    revision: 7,
    defaultProfileId: "pi",
    profiles: [
      { id: "pi", kind: "pi", enabled: true, isDefault: true },
      {
        id: "pi-client-default",
        kind: "pi-client",
        enabled: false,
        isDefault: false,
        serverUrl: "",
        hasAuthToken: false,
      },
    ],
  }
  assert.deepEqual(runtimeSettingsViewSchema.parse(view), view)
  assert.equal(
    runtimeSettingsViewSchema.safeParse({
      ...view,
      profiles: view.profiles.map((profile) => ({
        ...profile,
        isDefault: false,
      })),
    }).success,
    false
  )

  assert.equal(
    runtimeSettingsViewSchema.safeParse({
      ...view,
      profiles: view.profiles.map((profile) =>
        profile.id === "pi" ? { ...profile, enabled: false } : profile
      ),
    }).success,
    false
  )

  assert.equal(
    runtimeSettingsViewSchema.safeParse({
      ...view,
      defaultProfileId: "pi-client-default",
      profiles: view.profiles.map((profile) => ({
        ...profile,
        isDefault: profile.id === "pi-client-default",
      })),
    }).success,
    false
  )
})
