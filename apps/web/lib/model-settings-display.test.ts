import assert from "node:assert/strict"
import test from "node:test"

import type { ModelSettingsProvider } from "@workspace/runtime-protocol"
import { isModelProviderVisibleByDefault } from "@/lib/model-settings-display"

function provider(
  authStatus: "configured" | "missing" | "expired" | "unknown" | "not-required",
  modelCount = 0,
  customModels: ModelSettingsProvider["customModels"] = []
) {
  return { authStatus, modelCount, customModels }
}

test("default provider list omits unavailable providers without hiding setup work", () => {
  assert.equal(isModelProviderVisibleByDefault(provider("configured")), true)
  assert.equal(isModelProviderVisibleByDefault(provider("not-required")), true)
  assert.equal(isModelProviderVisibleByDefault(provider("unknown", 2)), true)
  assert.equal(
    isModelProviderVisibleByDefault(
      provider("missing", 0, [
        {
          id: "saved-model",
          name: "Saved model",
          reasoning: false,
          input: ["text"],
          contextWindow: 8192,
          maxTokens: 1024,
        },
      ])
    ),
    true
  )
  assert.equal(isModelProviderVisibleByDefault(provider("missing")), false)
  assert.equal(isModelProviderVisibleByDefault(provider("expired")), false)
})
