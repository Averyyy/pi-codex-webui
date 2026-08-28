import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import * as codingAgent from "@earendil-works/pi-coding-agent"
import type { HostToWorkerMessage } from "@workspace/runtime-protocol"

import type { ModelThinkingModule } from "./coding-agent.js"
import { handleModelSettingsMessage } from "./model-settings.js"

type ProviderMessage = Extract<
  HostToWorkerMessage,
  { type: "providers.save" | "providers.remove" }
>
type ModelScopeMessage = Extract<
  HostToWorkerMessage,
  { type: "models.catalog" | "models.set-scope" }
>

const modelThinking: ModelThinkingModule = {
  getSupportedThinkingLevels: (model) =>
    model.reasoning ? ["off", "minimal", "low", "medium", "high"] : ["off"],
  clampThinkingLevel(model, level) {
    const levels = this.getSupportedThinkingLevels(model)
    return levels.includes(level) ? level : levels.at(-1)!
  },
}

test("custom provider settings persist, edit, and remove through Pi files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-settings-"))
  const message = (
    type: ProviderMessage["type"],
    payload: ProviderMessage["payload"]
  ) => ({ requestId: type, type, payload }) as ProviderMessage

  try {
    await writeFile(
      path.join(root, "models.json"),
      '{\n  // JSONC remains readable by the settings layer.\n  "providers": {}\n}\n'
    )

    const saved = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      message("providers.save", {
        cwd: root,
        agentDir: root,
        provider: "local-provider",
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:9000/v1",
        apiKey: "test-key",
        models: [
          {
            id: "local-model",
            name: "Local model",
            reasoning: true,
            input: ["text"],
            contextWindow: 32_000,
            maxTokens: 4_000,
          },
        ],
      })
    )
    const savedProvider = saved.providers.find(
      ({ provider }) => provider === "local-provider"
    )
    assert.equal(savedProvider?.custom, true)
    assert.equal(savedProvider?.customModels[0]?.id, "local-model")
    assert.equal(saved.defaultModel, null)
    assert.deepEqual(
      saved.models.find(
        ({ provider, id }) =>
          provider === "local-provider" && id === "local-model"
      ),
      {
        provider: "local-provider",
        id: "local-model",
        name: "Local model",
        reasoning: true,
        input: ["text"],
        contextWindow: 32_000,
        maxTokens: 4_000,
        enabled: true,
        availableThinkingLevels: ["off", "minimal", "low", "medium", "high"],
        defaultThinkingLevel: "medium",
      }
    )
    assert.equal(
      saved.models.some(
        ({ provider, id }) =>
          provider === "local-provider" && id === "local-model"
      ),
      true
    )

    const edited = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      message("providers.save", {
        cwd: root,
        agentDir: root,
        provider: "local-provider",
        name: "Edited local provider",
        api: "openai-responses",
        baseUrl: "http://127.0.0.1:9001/v1",
        models: [
          {
            id: "edited-model",
            name: "Edited model",
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 64_000,
            maxTokens: 8_000,
          },
        ],
      })
    )
    assert.equal(
      edited.providers.find(({ provider }) => provider === "local-provider")
        ?.name,
      "Edited local provider"
    )
    assert.equal(
      edited.models.some(
        ({ provider, id }) =>
          provider === "local-provider" && id === "edited-model"
      ),
      true
    )

    const modelsJson = JSON.parse(
      await readFile(path.join(root, "models.json"), "utf8")
    ) as { providers: Record<string, { baseUrl: string }> }
    assert.equal(
      modelsJson.providers["local-provider"]?.baseUrl,
      "http://127.0.0.1:9001/v1"
    )

    const removed = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      message("providers.remove", {
        cwd: root,
        agentDir: root,
        provider: "local-provider",
      })
    )
    assert.equal(
      removed.providers.some(({ provider }) => provider === "local-provider"),
      false
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("model catalog refresh reads external provider and model changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-refresh-"))
  const message = (type: "models.catalog" | "models.refresh") =>
    ({
      requestId: type,
      type,
      payload: { cwd: root, agentDir: root },
    }) as Extract<HostToWorkerMessage, { type: typeof type }>

  try {
    await writeFile(path.join(root, "models.json"), '{"providers":{}}\n')
    const initial = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      message("models.catalog")
    )
    assert.equal(
      initial.providers.some(({ provider }) => provider === "external"),
      false
    )

    await writeFile(
      path.join(root, "models.json"),
      `${JSON.stringify({
        providers: {
          external: {
            api: "openai-completions",
            baseUrl: "http://127.0.0.1:9000/v1",
            apiKey: "test-key",
            models: [{ id: "fresh-model", name: "Fresh model" }],
          },
        },
      })}\n`
    )

    const refreshed = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      message("models.refresh")
    )
    assert.equal(
      refreshed.providers.some(({ provider }) => provider === "external"),
      true
    )
    assert.equal(
      refreshed.models.some(
        ({ provider, id }) => provider === "external" && id === "fresh-model"
      ),
      true
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("stale model scope mutations cannot overwrite a newer scope", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-scope-"))
  const resourceMessage = <T extends ModelScopeMessage["type"]>(
    type: T,
    payload: Extract<ModelScopeMessage, { type: T }>["payload"]
  ) =>
    ({ requestId: type, type, payload }) as Extract<
      ModelScopeMessage,
      { type: T }
    >
  const providerMessage = (
    payload: Extract<ProviderMessage, { type: "providers.save" }>["payload"]
  ) =>
    ({
      requestId: "providers.save",
      type: "providers.save",
      payload,
    }) as Extract<ProviderMessage, { type: "providers.save" }>

  try {
    const basePayload = { cwd: root, agentDir: root }
    const initial = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      providerMessage({
        ...basePayload,
        provider: "scope-provider",
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:9000/v1",
        apiKey: "test-key",
        models: ["model-a", "model-b"].map((id) => ({
          id,
          name: id,
          reasoning: false,
          input: ["text"],
          contextWindow: 32_000,
          maxTokens: 4_000,
        })),
      })
    )
    const initiallyEnabled = initial.models
      .filter((model) => model.enabled)
      .map((model) => `${model.provider}/${model.id}`)
    assert.deepEqual(initiallyEnabled, [
      "scope-provider/model-a",
      "scope-provider/model-b",
    ])

    const saved = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      resourceMessage("models.set-scope", {
        ...basePayload,
        enabledModelIds: ["scope-provider/model-a"],
        expectedEnabledModelIds: initiallyEnabled,
      })
    )
    assert.deepEqual(saved.enabledModels, ["scope-provider/model-a"])

    await assert.rejects(
      handleModelSettingsMessage(
        codingAgent,
        modelThinking,
        resourceMessage("models.set-scope", {
          ...basePayload,
          enabledModelIds: ["scope-provider/model-b"],
          expectedEnabledModelIds: initiallyEnabled,
        })
      ),
      { name: "ModelScopeConflict" }
    )

    const current = await handleModelSettingsMessage(
      codingAgent,
      modelThinking,
      resourceMessage("models.catalog", basePayload)
    )
    assert.deepEqual(current.enabledModels, ["scope-provider/model-a"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
