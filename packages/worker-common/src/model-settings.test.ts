import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import * as codingAgent from "@earendil-works/pi-coding-agent"
import {
  modelSettingsSnapshotSchema,
  type HostToWorkerMessage,
} from "@workspace/runtime-protocol"

import type { ModelThinkingModule } from "./coding-agent.js"
import { projectTrustedForWeb } from "./project-trust.js"
import {
  handleModelSettingsMessage,
  providerAuthPresentation,
} from "./model-settings.js"

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

test("model settings preserve models without supported thinking levels", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-no-thinking-"))
  try {
    await writeFile(
      path.join(root, "models.json"),
      JSON.stringify({
        providers: {
          fixture: {
            api: "openai-completions",
            baseUrl: "http://127.0.0.1:1/v1",
            apiKey: "fixture-key",
            models: [
              {
                id: "no-thinking",
                name: "No thinking model",
                reasoning: true,
                thinkingLevelMap: {
                  off: null,
                  minimal: null,
                  low: null,
                  medium: null,
                  high: null,
                  xhigh: null,
                  max: null,
                },
                input: ["text"],
                contextWindow: 16_000,
                maxTokens: 2_000,
              },
            ],
          },
        },
      })
    )

    await writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({ enabledModels: ["fixture/no-thinking"] })
    )
    for (const worker of ["worker-pi", "worker-pi-client"]) {
      const sdk: ModelThinkingModule = await import(
        pathToFileURL(
          path.resolve(
            import.meta.dirname,
            `../../${worker}/node_modules/@earendil-works/pi-ai/dist/index.js`
          )
        ).href
      )
      for (const scope of ["all", "enabled"] as const) {
        const result = await handleModelSettingsMessage(codingAgent, sdk, {
          type: "models.catalog",
          requestId: `${worker}-${scope}-no-thinking`,
          payload: { cwd: root, agentDir: root, scope },
        })
        const model = result.models.find(
          ({ provider, id }) => provider === "fixture" && id === "no-thinking"
        )
        assert.deepEqual(
          model?.availableThinkingLevels,
          [],
          `${worker}/${scope}`
        )
        assert.equal(model?.defaultThinkingLevel, "off", `${worker}/${scope}`)
        assert.equal(
          modelSettingsSnapshotSchema.safeParse(result).success,
          true
        )
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("provider auth presentation requires affirmative provider status", () => {
  const missingApiKey = providerAuthPresentation({
    authStatus: { configured: false },
    providerKnown: true,
    hasOAuthAuth: false,
    hasApiKeyAuth: true,
    apiKeyHasLogin: true,
    delegatedRuntime: false,
  })
  assert.equal(missingApiKey.authKind, "api-key")
  assert.equal(missingApiKey.authStatus, "missing")
  assert.equal(missingApiKey.apiKeyConfigured, false)

  const environment = providerAuthPresentation({
    authStatus: { configured: true, source: "environment" },
    providerKnown: true,
    hasOAuthAuth: false,
    hasApiKeyAuth: true,
    apiKeyHasLogin: false,
    delegatedRuntime: false,
  })
  assert.equal(environment.authKind, "environment")
  assert.equal(environment.authStatus, "configured")
  assert.equal(environment.apiKeyConfigured, true)

  const oauthCredentialWithoutCurrentStatus = providerAuthPresentation({
    authStatus: { configured: false },
    credentialType: "oauth",
    providerKnown: true,
    hasOAuthAuth: true,
    hasApiKeyAuth: false,
    apiKeyHasLogin: false,
    delegatedRuntime: false,
  })
  assert.equal(oauthCredentialWithoutCurrentStatus.authKind, "oauth")
  assert.equal(oauthCredentialWithoutCurrentStatus.authStatus, "unknown")

  const keylessLocalWithNoAuthEvidence = providerAuthPresentation({
    authStatus: { configured: false },
    providerKnown: true,
    hasOAuthAuth: false,
    hasApiKeyAuth: true,
    apiKeyHasLogin: false,
    delegatedRuntime: false,
  })
  assert.equal(keylessLocalWithNoAuthEvidence.authKind, "environment")
  assert.equal(keylessLocalWithNoAuthEvidence.authStatus, "missing")

  const noAuthProvider = providerAuthPresentation({
    authStatus: { configured: false },
    providerKnown: true,
    hasOAuthAuth: false,
    hasApiKeyAuth: false,
    apiKeyHasLogin: false,
    delegatedRuntime: false,
  })
  assert.equal(noAuthProvider.authKind, "none")
  assert.equal(noAuthProvider.authStatus, "not-required")

  const delegated = providerAuthPresentation({
    authStatus: { configured: true, source: "stored" },
    credentialType: "api_key",
    providerKnown: true,
    hasOAuthAuth: true,
    hasApiKeyAuth: true,
    apiKeyHasLogin: true,
    delegatedRuntime: true,
  })
  assert.equal(delegated.authKind, "delegated")
  assert.equal(delegated.authStatus, "configured")
  assert.equal(delegated.apiKeyConfigured, false)
})

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
    // The catalog can contain additional available models (built-in providers
    // are machine-dependent), so assert the saved provider's models are enabled
    // and keep using the full list as the scope baseline below.
    assert.ok(initiallyEnabled.includes("scope-provider/model-a"))
    assert.ok(initiallyEnabled.includes("scope-provider/model-b"))

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

test("composer reads only scoped models without live refresh or provider metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-scoped-models-"))
  try {
    await writeFile(
      path.join(root, "models.json"),
      JSON.stringify({
        providers: {
          scoped: {
            api: "openai-completions",
            baseUrl: "http://127.0.0.1:1/v1",
            apiKey: "fixture-key",
            models: [
              { id: "selected", name: "Selected", reasoning: true },
              { id: "excluded", name: "Excluded" },
            ],
          },
        },
      })
    )
    await writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({
        enabledModels: ["scoped/selected:high"],
        defaultProvider: "scoped",
        defaultModel: "selected",
      })
    )
    const guardedAgent = {
      ...codingAgent,
      ModelRuntime: {
        create() {
          throw new Error(
            "Composer must not construct the settings provider catalog"
          )
        },
      },
      async createAgentSessionServices(
        options: Parameters<typeof codingAgent.createAgentSessionServices>[0]
      ) {
        const services = await codingAgent.createAgentSessionServices(options)
        const runtime = services.modelRuntime
        services.modelRuntime = new Proxy(runtime, {
          get(target, property) {
            if (
              ["refresh", "listCredentials", "getProviders"].includes(
                String(property)
              )
            ) {
              return () => {
                throw new Error(`Composer must not call ${String(property)}`)
              }
            }
            const value = Reflect.get(target, property, target)
            return typeof value === "function" ? value.bind(target) : value
          },
        })
        return services
      },
    } as unknown as typeof codingAgent
    const read = () =>
      handleModelSettingsMessage(guardedAgent, modelThinking, {
        type: "models.catalog",
        requestId: "scoped",
        payload: { cwd: root, agentDir: root, scope: "enabled" },
      })
    const result = await read()
    assert.deepEqual(
      result.models.map((model) => model.id),
      ["selected"]
    )
    assert.equal(result.models[0]?.defaultThinkingLevel, "high")
    assert.equal(result.defaultModel?.id, "selected")
    assert.deepEqual(result.providers, [])
    await writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({ enabledModels: ["scoped/excluded"] })
    )
    assert.deepEqual(
      (await read()).models.map((model) => model.id),
      ["excluded"]
    )
    await writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({ enabledModels: ["scoped/selected", "scoped/missing"] })
    )
    const partial = await read()
    assert.deepEqual(
      partial.models.map((model) => model.id),
      ["selected"]
    )
    assert.equal(partial.scopeWarnings?.length, 1)
    assert.match(partial.scopeWarnings?.[0] ?? "", /No models match/)
    await writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({ enabledModels: ["scoped/missing"] })
    )
    const unmatched = await read()
    assert.match(unmatched.scopeWarnings?.[0] ?? "", /No models match/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("full, enabled, and refresh catalogs honor the runtime project trust decision", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-project-trust-"))
  const agentDir = path.join(root, "agent")
  const cwd = path.join(root, "project")
  await mkdir(path.join(cwd, ".pi"), { recursive: true })
  await mkdir(agentDir, { recursive: true })
  const projectSettingsPath = path.join(cwd, ".pi", "settings.json")
  try {
    await writeFile(
      path.join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          fixture: {
            api: "openai-completions",
            baseUrl: "http://127.0.0.1:1/v1",
            apiKey: "fixture-key",
            models: [
              {
                id: "global-model",
                name: "Global model",
                reasoning: false,
                input: ["text"],
                contextWindow: 16_000,
                maxTokens: 2_000,
              },
              {
                id: "alternate-model",
                name: "Project model",
                reasoning: false,
                input: ["text"],
                contextWindow: 16_000,
                maxTokens: 2_000,
              },
            ],
          },
        },
      })
    )
    await writeFile(
      projectSettingsPath,
      JSON.stringify({
        enabledModels: ["fixture/alternate-model"],
        defaultProvider: "fixture",
        defaultModel: "alternate-model",
      })
    )

    const trustStore = new codingAgent.ProjectTrustStore(agentDir)
    const cases = [
      {
        name: "explicit true",
        decision: true as boolean | null,
        defaultProjectTrust: "never",
        trusted: true,
        expectedModel: "alternate-model",
      },
      {
        name: "explicit false overrides always",
        decision: false as boolean | null,
        defaultProjectTrust: "always",
        trusted: false,
        expectedModel: "global-model",
      },
      {
        name: "default always without an explicit decision",
        decision: null,
        defaultProjectTrust: "always",
        trusted: true,
        expectedModel: "alternate-model",
      },
    ]

    for (const fixture of cases) {
      await writeFile(
        path.join(agentDir, "settings.json"),
        JSON.stringify({
          defaultProjectTrust: fixture.defaultProjectTrust,
          enabledModels: ["fixture/global-model"],
          defaultProvider: "fixture",
          defaultModel: "global-model",
        })
      )
      trustStore.set(cwd, fixture.decision)
      assert.equal(
        projectTrustedForWeb(codingAgent, cwd, agentDir),
        fixture.trusted,
        fixture.name
      )

      const all = await handleModelSettingsMessage(codingAgent, modelThinking, {
        type: "models.catalog",
        requestId: `${fixture.name}-all`,
        payload: { cwd, agentDir, scope: "all" },
      })
      const enabled = await handleModelSettingsMessage(
        codingAgent,
        modelThinking,
        {
          type: "models.catalog",
          requestId: `${fixture.name}-enabled`,
          payload: { cwd, agentDir, scope: "enabled" },
        }
      )
      const refreshed = await handleModelSettingsMessage(
        codingAgent,
        modelThinking,
        {
          type: "models.refresh",
          requestId: `${fixture.name}-refresh`,
          payload: { cwd, agentDir },
        }
      )

      for (const snapshot of [all, refreshed]) {
        assert.equal(
          snapshot.defaultModel?.id,
          fixture.expectedModel,
          fixture.name
        )
        const selected = snapshot.models.find(
          ({ id }) => id === fixture.expectedModel
        )
        assert.equal(selected?.enabled, true, fixture.name)
      }
      assert.deepEqual(
        enabled.models.map(({ id }) => id),
        [fixture.expectedModel],
        fixture.name
      )
      assert.equal(
        enabled.defaultModel?.id,
        fixture.expectedModel,
        fixture.name
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("full and composer catalogs agree for partial and unmatched scopes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-scope-parity-"))
  try {
    await writeFile(
      path.join(root, "models.json"),
      JSON.stringify({
        providers: {
          parity: {
            api: "openai-completions",
            baseUrl: "http://127.0.0.1:1/v1",
            apiKey: "fixture-key",
            models: [
              { id: "one", name: "One", reasoning: true },
              { id: "two", name: "Two", reasoning: true },
            ],
          },
        },
      })
    )
    for (const enabledModels of [
      ["parity/one:high"],
      ["parity/two"],
      ["parity/two", "parity/one:high"],
      ["parity/not-present"],
    ]) {
      await writeFile(
        path.join(root, "settings.json"),
        JSON.stringify({
          enabledModels,
          defaultProvider: "parity",
          defaultModel: "one",
          defaultThinkingLevel: "medium",
        })
      )
      const read = (scope: "all" | "enabled") =>
        handleModelSettingsMessage(codingAgent, modelThinking, {
          type: "models.catalog",
          requestId: `scope-parity-${scope}`,
          payload: { cwd: root, agentDir: root, scope },
        })
      const [all, enabled] = await Promise.all([read("all"), read("enabled")])
      assert.deepEqual(
        enabled.models,
        all.models.filter((model) => model.enabled),
        `scope ${enabledModels[0]}`
      )
      assert.deepEqual(enabled.scopeWarnings, all.scopeWarnings)
      const enabledIds = new Set(
        enabled.models.map((model) => `${model.provider}/${model.id}`)
      )
      assert.deepEqual(
        all.defaultModel &&
          enabledIds.has(`${all.defaultModel.provider}/${all.defaultModel.id}`)
          ? all.defaultModel
          : null,
        enabled.defaultModel
      )
      assert.deepEqual(enabled.enabledModels, all.enabledModels)
      assert.deepEqual(enabled.providers, [])
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
