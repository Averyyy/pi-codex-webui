import assert from "node:assert/strict"
import test from "node:test"

import type {
  ModelSettings,
  ModelSettingsModel,
} from "@workspace/runtime-protocol"

import { reconcileNewConversationModelSelection } from "@/lib/model-catalog-selection"

function model(id: string, enabled = true): ModelSettingsModel {
  return {
    provider: "fixture",
    id,
    name: id,
    reasoning: true,
    input: ["text"],
    contextWindow: 32_000,
    maxTokens: 4_000,
    enabled,
    availableThinkingLevels: ["low", "high"],
    defaultThinkingLevel: "low",
  }
}

function settings(
  catalogIdentity: string,
  catalogVersion: string,
  models: ModelSettingsModel[],
  defaultModel: ModelSettingsModel | null
): ModelSettings {
  return {
    catalogIdentity,
    catalogVersion,
    models,
    enabledModels: models
      .filter((entry) => entry.enabled)
      .map((entry) => `${entry.provider}/${entry.id}`),
    providers: [],
    defaultModel,
  }
}

test("same-target catalog revalidation preserves a non-default selection", () => {
  const firstChoice = model("first")
  const customChoice = model("custom")
  const current = {
    projectId: "project-a",
    catalogIdentity: "runtime-a",
    model: customChoice,
    thinkingLevel: "high" as const,
  }

  const duringRevalidation = reconcileNewConversationModelSelection(
    current,
    "project-a",
    null
  )
  assert.equal(duringRevalidation, current)

  const refreshedCustomChoice = model("custom")
  const afterRevalidation = reconcileNewConversationModelSelection(
    duringRevalidation,
    "project-a",
    settings(
      "runtime-a",
      "version-2",
      [firstChoice, refreshedCustomChoice],
      firstChoice
    )
  )
  assert.equal(afterRevalidation.model, refreshedCustomChoice)
  assert.equal(afterRevalidation.thinkingLevel, "high")
})

test("catalog reconciliation resets only on identity change or confirmed removal", () => {
  const firstChoice = model("first")
  const customChoice = model("custom")
  const current = {
    projectId: "project-a",
    catalogIdentity: "runtime-a",
    model: customChoice,
    thinkingLevel: "high" as const,
  }

  const identityChanged = reconcileNewConversationModelSelection(
    current,
    "project-a",
    settings("runtime-b", "version-1", [firstChoice, customChoice], firstChoice)
  )
  assert.equal(identityChanged.model, firstChoice)
  assert.equal(identityChanged.catalogIdentity, "runtime-b")

  const removed = reconcileNewConversationModelSelection(
    current,
    "project-a",
    settings(
      "runtime-a",
      "version-2",
      [firstChoice, model("custom", false)],
      firstChoice
    )
  )
  assert.equal(removed.model, firstChoice)
  assert.equal(removed.catalogIdentity, "runtime-a")
})
