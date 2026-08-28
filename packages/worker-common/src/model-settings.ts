import { randomUUID } from "node:crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

import type {
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent"
import lockfile from "proper-lockfile"
import stripJsonComments from "strip-json-comments"
import type {
  HostToWorkerMessage,
  ModelProviderApi,
  ModelSettings,
  ModelSettingsCustomModel,
  ModelSettingsProviderInput,
  RuntimeModel,
} from "@workspace/runtime-protocol"

import { createSettingsManager } from "./settings.js"
import type { CodingAgentModule, ModelThinkingModule } from "./coding-agent.js"

type ModelSettingsMessage = Extract<
  HostToWorkerMessage,
  {
    type:
      | "models.catalog"
      | "models.refresh"
      | "models.set-scope"
      | "providers.remove"
      | "providers.save"
  }
>

type JsonObject = Record<string, unknown>
interface ModelsConfig {
  providers: Record<string, JsonObject>
}

interface ModelSettingsState {
  codingAgent: CodingAgentModule
  modelThinking: ModelThinkingModule
  modelRuntime: ModelRuntime
  builtInProviders: Set<string>
  settingsManager: SettingsManager
  modelsPath: string
  authPath: string
}

const supportedApis = new Set<ModelProviderApi>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
])

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function modelKey(model: { provider: string; id: string }) {
  return `${model.provider}/${model.id}`
}

function readModelsConfig(modelsPath: string): ModelsConfig {
  if (!existsSync(modelsPath)) return { providers: {} }

  const parsed: unknown = JSON.parse(
    stripJsonComments(readFileSync(modelsPath, "utf8"))
  )
  if (!isJsonObject(parsed) || !isJsonObject(parsed.providers)) {
    throw new Error(`Invalid models.json: providers must be an object.`)
  }

  const providers: Record<string, JsonObject> = {}
  for (const [provider, config] of Object.entries(parsed.providers)) {
    if (!isJsonObject(config)) {
      throw new Error(
        `Invalid models.json: provider ${provider} must be an object.`
      )
    }
    if (config.models !== undefined && !Array.isArray(config.models)) {
      throw new Error(
        `Invalid models.json: provider ${provider}.models must be an array.`
      )
    }
    providers[provider] = config
  }
  return { providers }
}

function readApi(
  value: unknown,
  provider: string
): ModelProviderApi | undefined {
  if (value === undefined) return undefined
  if (
    typeof value !== "string" ||
    !supportedApis.has(value as ModelProviderApi)
  ) {
    throw new Error(`Provider ${provider} has an unsupported API.`)
  }
  return value as ModelProviderApi
}

function readPositiveInteger(value: unknown, fallback: number, label: string) {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return value
}

function readCustomModel(
  value: unknown,
  provider: string
): ModelSettingsCustomModel {
  if (!isJsonObject(value) || typeof value.id !== "string" || !value.id) {
    throw new Error(`Provider ${provider} has a model without a valid id.`)
  }

  const input =
    value.input === undefined
      ? (["text"] as const)
      : Array.isArray(value.input) &&
          value.input.length > 0 &&
          value.input.every((item) => item === "text" || item === "image")
        ? (value.input as Array<"text" | "image">)
        : null
  if (!input) {
    throw new Error(
      `Provider ${provider}, model ${value.id} has invalid input.`
    )
  }

  return {
    id: value.id,
    name: typeof value.name === "string" && value.name ? value.name : value.id,
    reasoning: value.reasoning === true,
    input: [...input],
    contextWindow: readPositiveInteger(
      value.contextWindow,
      128_000,
      `Provider ${provider}, model ${value.id} contextWindow`
    ),
    maxTokens: readPositiveInteger(
      value.maxTokens,
      16_384,
      `Provider ${provider}, model ${value.id} maxTokens`
    ),
  }
}

function customModels(
  config: JsonObject | undefined,
  provider: string
): ModelSettingsCustomModel[] {
  if (!config?.models) return []
  if (!Array.isArray(config.models)) {
    throw new Error(`Provider ${provider}.models must be an array.`)
  }
  return config.models.map((model) => readCustomModel(model, provider))
}

function writeModelsConfig(
  modelsPath: string,
  update: (current: ModelsConfig) => ModelsConfig
) {
  const directory = path.dirname(modelsPath)
  mkdirSync(directory, { recursive: true })
  const release = lockfile.lockSync(modelsPath, { realpath: false })
  try {
    const current = readModelsConfig(modelsPath)
    const next = update(current)
    const temporaryPath = path.join(
      directory,
      `.${path.basename(modelsPath)}.${randomUUID()}.tmp`
    )
    let handle: number | undefined
    try {
      handle = openSync(temporaryPath, "wx", 0o600)
      writeFileSync(handle, `${JSON.stringify(next, null, 2)}\n`, "utf8")
      fsyncSync(handle)
      closeSync(handle)
      handle = undefined
      renameSync(temporaryPath, modelsPath)
    } catch (error) {
      if (handle !== undefined) closeSync(handle)
      rmSync(temporaryPath, { force: true })
      throw error
    }

    if (process.platform !== "win32") {
      const directoryHandle = openSync(directory, "r")
      try {
        fsyncSync(directoryHandle)
      } finally {
        closeSync(directoryHandle)
      }
    }
  } finally {
    release()
  }
}

async function createModelSettingsState(
  codingAgent: CodingAgentModule,
  modelThinking: ModelThinkingModule,
  cwd: string,
  agentDir: string
): Promise<ModelSettingsState> {
  const resolvedAgentDir = path.resolve(agentDir)
  const modelsPath = path.join(resolvedAgentDir, "models.json")
  const authPath = path.join(resolvedAgentDir, "auth.json")
  const settingsManager = createSettingsManager(
    codingAgent,
    cwd,
    agentDir,
    false
  )
  const services = await codingAgent.createAgentSessionServices({
    cwd,
    agentDir,
    settingsManager,
  })
  const staticRuntime = await codingAgent.ModelRuntime.create({
    authPath,
    modelsPath: null,
    refreshOnCreate: false,
  })
  const builtInProviders = new Set(
    staticRuntime.getProviders().map((provider) => provider.id)
  )
  return {
    codingAgent,
    modelThinking,
    modelRuntime: services.modelRuntime,
    builtInProviders,
    settingsManager: services.settingsManager,
    modelsPath,
    authPath,
  }
}

async function refreshModelRuntime(state: ModelSettingsState) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const result = await state.modelRuntime.refresh({
      force: true,
      signal: controller.signal,
    })
    if (result.aborted && result.errors.size === 0) {
      return {
        ...result,
        errors: new Map([
          ["model-catalog", new Error("Model catalog refresh timed out.")],
        ]),
      }
    }
    return result
  } finally {
    clearTimeout(timeout)
  }
}

async function credentialsByProvider(state: ModelSettingsState) {
  return new Map(
    (await state.modelRuntime.listCredentials()).map((credential) => [
      credential.providerId,
      credential,
    ])
  )
}

function readAuthConfig(authPath: string): Record<string, JsonObject> {
  if (!existsSync(authPath)) return {}
  const parsed: unknown = JSON.parse(readFileSync(authPath, "utf8"))
  if (!isJsonObject(parsed)) {
    throw new Error("Invalid auth.json: expected an object.")
  }
  const credentials: Record<string, JsonObject> = {}
  for (const [provider, credential] of Object.entries(parsed)) {
    if (!isJsonObject(credential)) {
      throw new Error(
        `Invalid auth.json credential for provider "${provider}".`
      )
    }
    credentials[provider] = credential
  }
  return credentials
}

function writeAuthConfig(
  authPath: string,
  update: (current: Record<string, JsonObject>) => Record<string, JsonObject>
) {
  const directory = path.dirname(authPath)
  mkdirSync(directory, { recursive: true })
  const release = lockfile.lockSync(authPath, { realpath: false })
  try {
    const next = update(readAuthConfig(authPath))
    const temporaryPath = path.join(
      directory,
      `.${path.basename(authPath)}.${randomUUID()}.tmp`
    )
    let handle: number | undefined
    try {
      handle = openSync(temporaryPath, "wx", 0o600)
      writeFileSync(handle, `${JSON.stringify(next, null, 2)}\n`, "utf8")
      fsyncSync(handle)
      closeSync(handle)
      handle = undefined
      renameSync(temporaryPath, authPath)
    } catch (error) {
      if (handle !== undefined) closeSync(handle)
      rmSync(temporaryPath, { force: true })
      throw error
    }
    if (process.platform !== "win32") {
      const directoryHandle = openSync(directory, "r")
      try {
        fsyncSync(directoryHandle)
      } finally {
        closeSync(directoryHandle)
      }
    }
  } finally {
    release()
  }
}

export async function resolveConfiguredScopedModels(
  codingAgent: CodingAgentModule,
  settingsManager: Pick<SettingsManager, "getEnabledModels">,
  modelRuntime: ModelRuntime
) {
  const patterns = settingsManager.getEnabledModels()
  if (!patterns || patterns.length === 0) return []
  return (
    await codingAgent.resolveModelScopeWithDiagnostics(patterns, modelRuntime)
  ).scopedModels
}

function toRuntimeModel(model: {
  provider: string
  id: string
  name: string
  reasoning: boolean
  input: RuntimeModel["input"]
  contextWindow: number
  maxTokens: number
}): RuntimeModel {
  return {
    provider: model.provider,
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: model.input,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  }
}

async function readModelSettings(
  state: ModelSettingsState,
  refreshLive = true
): Promise<ModelSettings> {
  if (refreshLive) {
    await refreshModelRuntime(state)
  }
  const config = readModelsConfig(state.modelsPath)
  const availableModels = state.modelRuntime.getAvailableSnapshot()
  const patterns = state.settingsManager.getEnabledModels()
  const scopedModels = await resolveConfiguredScopedModels(
    state.codingAgent,
    state.settingsManager,
    state.modelRuntime
  )
  const defaultProvider = state.settingsManager.getDefaultProvider()
  const defaultModelId = state.settingsManager.getDefaultModel()
  const defaultModel =
    defaultProvider && defaultModelId
      ? availableModels.find(
          (model) =>
            model.provider === defaultProvider && model.id === defaultModelId
        )
      : undefined
  const enabledIds = new Set(
    patterns && patterns.length > 0
      ? scopedModels.map(({ model }) => modelKey(model))
      : availableModels.map(modelKey)
  )
  const credentials = await credentialsByProvider(state)
  const providers = new Set([
    ...state.modelRuntime.getProviders().map((provider) => provider.id),
    ...credentials.keys(),
    ...Object.keys(config.providers),
  ])
  const builtIns = state.builtInProviders
  const defaultThinkingLevel =
    state.settingsManager.getDefaultThinkingLevel() ?? "medium"
  const scopedThinkingLevels = new Map(
    scopedModels.map(({ model, thinkingLevel }) => [
      modelKey(model),
      thinkingLevel,
    ])
  )

  return {
    models: availableModels.map((model) => ({
      ...toRuntimeModel(model),
      enabled: enabledIds.has(modelKey(model)),
      availableThinkingLevels:
        state.modelThinking.getSupportedThinkingLevels(model),
      defaultThinkingLevel: state.modelThinking.clampThinkingLevel(
        model,
        scopedThinkingLevels.get(modelKey(model)) ?? defaultThinkingLevel
      ),
    })),
    providers: [...providers]
      .sort((left, right) => left.localeCompare(right))
      .map((provider) => {
        const credential = credentials.get(provider)
        const authStatus = state.modelRuntime.getProviderAuthStatus(provider)
        const rawConfig = config.providers[provider]
        const custom = Boolean(rawConfig) && !builtIns.has(provider)
        return {
          provider,
          auth:
            credential?.type === "oauth"
              ? ("oauth" as const)
              : credential
                ? ("api-key" as const)
                : authStatus.source === "environment"
                  ? ("environment" as const)
                  : authStatus.configured
                    ? ("api-key" as const)
                    : ("environment" as const),
          removable: custom || credential !== undefined,
          modelCount: availableModels.filter(
            (model) => model.provider === provider
          ).length,
          custom,
          name:
            typeof rawConfig?.name === "string" && rawConfig.name
              ? rawConfig.name
              : undefined,
          api: readApi(rawConfig?.api, provider),
          baseUrl:
            typeof rawConfig?.baseUrl === "string"
              ? rawConfig.baseUrl
              : undefined,
          apiKeyConfigured:
            credential?.type === "api_key" ||
            authStatus.source === "models_json_key" ||
            authStatus.source === "models_json_command" ||
            authStatus.source === "environment",
          customModels: customModels(custom ? rawConfig : undefined, provider),
        }
      }),
    enabledModels: patterns ?? null,
    defaultModel: defaultModel
      ? {
          provider: defaultModel.provider,
          id: defaultModel.id,
          name: defaultModel.name,
        }
      : null,
  }
}

async function refreshModelSettings(state: ModelSettingsState) {
  await state.settingsManager.reload()
  const result = await refreshModelRuntime(state)
  const settings = await readModelSettings(state, false)
  const refreshErrors = [...result.errors.entries()].map(
    ([provider, error]) => ({ provider, message: error.message })
  )
  return refreshErrors.length ? { ...settings, refreshErrors } : settings
}

async function setModelScope(
  state: ModelSettingsState,
  enabledModelIds: string[] | null,
  expectedEnabledModelIds: string[]
) {
  const current = await readModelSettings(state)
  const availableIds = new Set(current.models.map(modelKey))
  const currentEnabledModelIds = current.models
    .filter((model) => model.enabled)
    .map(modelKey)
  const expectedIds = new Set(expectedEnabledModelIds)
  if (
    expectedIds.size !== currentEnabledModelIds.length ||
    currentEnabledModelIds.some((id) => !expectedIds.has(id))
  ) {
    const error = new Error("The model scope changed after this page loaded.")
    error.name = "ModelScopeConflict"
    throw error
  }

  if (enabledModelIds === null) {
    state.settingsManager.setEnabledModels(undefined)
  } else {
    if (new Set(enabledModelIds).size !== enabledModelIds.length) {
      throw new Error("Model scope cannot contain duplicate models.")
    }
    const invalid = enabledModelIds.find((id) => !availableIds.has(id))
    if (invalid) throw new Error(`Model ${invalid} is not available.`)
    state.settingsManager.setEnabledModels(
      enabledModelIds.length === current.models.length
        ? undefined
        : [...enabledModelIds]
    )
  }

  await state.settingsManager.flush()
  return readModelSettings(state)
}

function removeProviderFromScope(state: ModelSettingsState, provider: string) {
  const patterns = state.settingsManager.getEnabledModels()
  if (!patterns) return false
  const next = patterns.filter(
    (pattern) => pattern !== provider && !pattern.startsWith(`${provider}/`)
  )
  if (next.length === patterns.length) return false
  state.settingsManager.setEnabledModels(next.length ? next : undefined)
  return true
}

async function removeProvider(state: ModelSettingsState, provider: string) {
  const config = readModelsConfig(state.modelsPath)
  const builtIns = state.builtInProviders
  const custom = Boolean(config.providers[provider]) && !builtIns.has(provider)
  const credentials = await credentialsByProvider(state)
  if (!custom && !credentials.has(provider)) {
    throw new Error(
      `Provider ${provider} has no stored configuration to delete.`
    )
  }

  if (custom) {
    writeModelsConfig(state.modelsPath, (current) => {
      const providers = { ...current.providers }
      delete providers[provider]
      return { providers }
    })
  }
  if (credentials.has(provider)) {
    writeAuthConfig(state.authPath, (current) => {
      const next = { ...current }
      delete next[provider]
      return next
    })
  }
  const scopeChanged = removeProviderFromScope(state, provider)
  if (scopeChanged) await state.settingsManager.flush()
  await state.modelRuntime.refresh({ allowNetwork: false })
  return readModelSettings(state)
}

function nextModelConfig(
  previous: JsonObject | undefined,
  model: ModelSettingsCustomModel
) {
  const next = previous ? { ...previous } : {}
  delete next.id
  delete next.name
  delete next.reasoning
  delete next.input
  delete next.contextWindow
  delete next.maxTokens
  return {
    ...next,
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: model.input,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  }
}

async function saveCustomProvider(
  state: ModelSettingsState,
  input: ModelSettingsProviderInput
) {
  const builtIns = state.builtInProviders
  if (builtIns.has(input.provider)) {
    throw new Error(
      `Provider ${input.provider} is built in and cannot be edited here.`
    )
  }

  writeModelsConfig(state.modelsPath, (current) => {
    const previous = current.providers[input.provider]
    const previousModels = Array.isArray(previous?.models)
      ? previous.models.filter(isJsonObject)
      : []
    const nextProvider = previous ? { ...previous } : {}
    if (input.name) nextProvider.name = input.name
    else delete nextProvider.name
    nextProvider.api = input.api
    nextProvider.baseUrl = input.baseUrl
    nextProvider.models = input.models.map((model) =>
      nextModelConfig(
        previousModels.find((entry) => entry.id === model.id),
        model
      )
    )
    if (input.apiKey?.trim()) delete nextProvider.apiKey
    return {
      providers: { ...current.providers, [input.provider]: nextProvider },
    }
  })

  if (input.apiKey?.trim()) {
    writeAuthConfig(state.authPath, (current) => ({
      ...current,
      [input.provider]: {
        type: "api_key",
        key: input.apiKey!.trim(),
      },
    }))
  }
  await state.modelRuntime.refresh({ allowNetwork: false })
  return readModelSettings(state)
}

export async function handleModelSettingsMessage(
  codingAgent: CodingAgentModule,
  modelThinking: ModelThinkingModule,
  message: ModelSettingsMessage
) {
  const { cwd, agentDir } = message.payload
  const state = await createModelSettingsState(
    codingAgent,
    modelThinking,
    cwd,
    agentDir
  )
  if (message.type === "models.catalog") return readModelSettings(state)
  if (message.type === "models.refresh") return refreshModelSettings(state)
  if (message.type === "models.set-scope") {
    return setModelScope(
      state,
      message.payload.enabledModelIds,
      message.payload.expectedEnabledModelIds
    )
  }
  if (message.type === "providers.remove") {
    return removeProvider(state, message.payload.provider)
  }
  return saveCustomProvider(state, message.payload)
}
