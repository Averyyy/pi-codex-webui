import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import * as codingAgent from "@earendil-works/pi-coding-agent"
import type { HostToWorkerMessage } from "@workspace/runtime-protocol"

import { handleModelSettingsMessage } from "./model-settings.js"

type ProviderMessage = Extract<
  HostToWorkerMessage,
  { type: "providers.save" | "providers.remove" }
>

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
    assert.equal(
      saved.models.some(
        ({ provider, id }) =>
          provider === "local-provider" && id === "local-model"
      ),
      true
    )

    const edited = await handleModelSettingsMessage(
      codingAgent,
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
