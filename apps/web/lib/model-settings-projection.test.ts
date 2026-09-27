import assert from "node:assert/strict"
import test from "node:test"

import type { ModelSettings } from "@workspace/runtime-protocol"
import { projectEnabledModelSettings } from "@/lib/model-settings-projection"

function model(id: string, enabled: boolean): ModelSettings["models"][number] {
  return {
    provider: "fixture",
    id,
    name: id,
    reasoning: true,
    input: ["text"],
    contextWindow: 32_000,
    maxTokens: 4_000,
    enabled,
    availableThinkingLevels: ["low"],
    defaultThinkingLevel: "low",
  }
}

test("enabled projection matches the scoped worker contract and preserves diagnostics", () => {
  const all: ModelSettings = {
    catalogIdentity: "directory",
    catalogVersion: "version",
    models: [
      model("first", true),
      model("default-disabled", false),
      model("last", true),
    ],
    providers: [],
    enabledModels: ["fixture/first", "fixture/last"],
    defaultModel: {
      provider: "fixture",
      id: "default-disabled",
      name: "default-disabled",
    },
    scopeWarnings: ["An unmatched model pattern was ignored."],
    refreshErrors: [
      { provider: "remote", message: "A provider could not refresh." },
    ],
  }

  const enabled = projectEnabledModelSettings(all)

  assert.deepEqual(
    enabled.models.map((entry) => entry.id),
    ["first", "last"]
  )
  assert.equal(
    enabled.models.every((entry) => entry.enabled),
    true
  )
  assert.deepEqual(enabled.providers, [])
  assert.equal(enabled.defaultModel, null)
  assert.deepEqual(enabled.scopeWarnings, all.scopeWarnings)
  assert.deepEqual(enabled.refreshErrors, all.refreshErrors)
  assert.equal(enabled.catalogIdentity, all.catalogIdentity)
  assert.equal(enabled.catalogVersion, all.catalogVersion)
})
