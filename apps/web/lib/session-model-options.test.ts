import assert from "node:assert/strict"
import test from "node:test"

import type { ModelSettingsModel } from "@workspace/runtime-protocol"
import { sessionModelOptions } from "./session-model-options"

const catalogModel: ModelSettingsModel = {
  provider: "fixture",
  id: "catalog-choice",
  name: "Catalog choice",
  reasoning: true,
  input: ["text"],
  contextWindow: 32_000,
  maxTokens: 4_000,
  enabled: true,
  availableThinkingLevels: ["low"],
  defaultThinkingLevel: "low",
}

test("session model choices come only from the authoritative enabled catalog", () => {
  const initial = {
    snapshot: null,
    catalogIdentity: null,
    status: "idle" as const,
    error: null,
  }
  assert.deepEqual(sessionModelOptions(initial), [])

  const invalidated = {
    snapshot: null,
    catalogIdentity: "previous-identity",
    status: "idle" as const,
    error: null,
  }
  assert.deepEqual(sessionModelOptions(invalidated), [])
  assert.deepEqual(
    sessionModelOptions({
      ...invalidated,
      status: "error",
      error: "catalog unavailable",
    }),
    []
  )
  assert.deepEqual(
    sessionModelOptions({
      snapshot: {
        catalogIdentity: "current-identity",
        catalogVersion: "v1",
        models: [catalogModel],
        providers: [],
        enabledModels: [`${catalogModel.provider}/${catalogModel.id}`],
        defaultModel: null,
      },
      catalogIdentity: "current-identity",
      status: "ready",
      error: null,
    }),
    [catalogModel]
  )
})
