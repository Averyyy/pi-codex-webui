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
  ModelSettingsSnapshot,
  ModelSettingsCustomModel,
  ModelSettingsProviderInput,
  RuntimeModel,
} from "@workspace/runtime-protocol"

import { createSettingsManager } from "./settings.js"
import { projectTrustedForWeb } from "./project-trust.js"
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

type ProviderAuthKind =
  "oauth" | "api-key" | "environment" | "delegated" | "none" | "unknown"
type ProviderAuthStatus =
  "configured" | "missing" | "expired" | "unknown" | "not-required"

export function providerAuthPresentation(input: {
  authStatus: {
    configured: boolean
    source?: string
  }
  credentialType?: "oauth" | "api_key"
  providerKnown: boolean
  hasOAuthAuth: boolean
  hasApiKeyAuth: boolean
  apiKeyHasLogin: boolean
  delegatedRuntime: boolean
}): {
  authKind: ProviderAuthKind
  authStatus: ProviderAuthStatus
  auth: "api-key" | "oauth" | "environment"
  apiKeyConfigured: boolean
} {
  const authKind: ProviderAuthKind = input.delegatedRuntime
    ? "delegated"
    : input.credentialType === "oauth"
      ? "oauth"
      : input.credentialType === "api_key"
        ? "api-key"
        : input.authStatus.source === "environment"
          ? "environment"
          : input.authStatus.source === "runtime" ||
              input.authStatus.source === "stored" ||
              input.authStatus.source === "fallback" ||
              input.authStatus.source === "models_json_key" ||
              input.authStatus.source === "models_json_command"
            ? "api-key"
            : input.hasOAuthAuth && !input.hasApiKeyAuth
              ? "oauth"
              : input.hasApiKeyAuth && input.apiKeyHasLogin
                ? "api-key"
                : input.hasApiKeyAuth
                  ? "environment"
                  : input.providerKnown &&
                      !input.hasOAuthAuth &&
                      !input.hasApiKeyAuth
                    ? "none"
                    : "unknown"
  const authStatus: ProviderAuthStatus =
    input.providerKnown && !input.hasApiKeyAuth && !input.hasOAuthAuth
      ? "not-required"
      : input.delegatedRuntime
        ? input.authStatus.configured
          ? "configured"
          : "unknown"
        : input.authStatus.configured
          ? "configured"
          : input.credentialType !== undefined
            ? "unknown"
            : input.hasApiKeyAuth || input.hasOAuthAuth
              ? "missing"
              : "unknown"
  const apiKeyConfigured =
    !input.delegatedRuntime &&
    (input.credentialType === "api_key" ||
      input.authStatus.source === "models_json_key" ||
      input.authStatus.source === "models_json_command" ||
      input.authStatus.source === "environment" ||
      input.authStatus.source === "fallback" ||
      input.authStatus.source === "runtime" ||
      input.authStatus.source === "stored")
  return {
    authKind,
    authStatus,
    auth:
      authKind === "oauth"
        ? ("oauth" as const)
        : authKind === "api-key"
          ? ("api-key" as const)
          : ("environment" as const),
    apiKeyConfigured,
  }
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
  agentDir: string,
  metrics?: Record<string, number>
): Promise<ModelSettingsState> {
  const resolvedAgentDir = path.resolve(agentDir)
  const modelsPath = path.join(resolvedAgentDir, "models.json")
  const authPath = path.join(resolvedAgentDir, "auth.json")
  const settingsManager = createSettingsManager(
    codingAgent,
    cwd,
    agentDir,
    projectTrustedForWeb(codingAgent, cwd, agentDir)
  )
  const servicesStartedAt = Date.now()
  const services = await codingAgent.createAgentSessionServices({
    cwd,
    agentDir,
    settingsManager,
  })
  if (metrics) metrics.servicesInitializationMs = Date.now() - servicesStartedAt
  const runtimeStartedAt = Date.now()
  const staticRuntime = await codingAgent.ModelRuntime.create({
    authPath,
    modelsPath: null,
    refreshOnCreate: false,
  })
  if (metrics) metrics.staticModelRuntimeMs = Date.now() - runtimeStartedAt
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

// Unmatched patterns are warnings, as in pi itself: matched models stay usable.
export async function resolveConfiguredModelScope(
  codingAgent: CodingAgentModule,
  settingsManager: Pick<SettingsManager, "getEnabledModels">,
  modelRuntime: ModelRuntime
) {
  const patterns = settingsManager.getEnabledModels()
  if (!patterns || patterns.length === 0) {
    return { scopedModels: [], scopeWarnings: [] }
  }
  const { scopedModels, diagnostics } =
    await codingAgent.resolveModelScopeWithDiagnostics(patterns, modelRuntime)
  return {
    scopedModels,
    scopeWarnings: diagnostics.map((diagnostic) => diagnostic.message),
  }
}

export async function resolveConfiguredScopedModels(
  codingAgent: CodingAgentModule,
  settingsManager: Pick<SettingsManager, "getEnabledModels">,
  modelRuntime: ModelRuntime
) {
  return (
    await resolveConfiguredModelScope(
      codingAgent,
      settingsManager,
      modelRuntime
    )
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

// Reads local state only; network refresh happens solely via models.refresh.
async function readModelSettings(
  state: ModelSettingsState,
  metrics?: Record<string, number>
): Promise<ModelSettingsSnapshot> {
  const projectionStartedAt = Date.now()
  const config = readModelsConfig(state.modelsPath)
  const availableModels = state.modelRuntime.getAvailableSnapshot()
  const patterns = state.settingsManager.getEnabledModels()
  const scopeStartedAt = Date.now()
  const { scopedModels, scopeWarnings } = await resolveConfiguredModelScope(
    state.codingAgent,
    state.settingsManager,
    state.modelRuntime
  )
  if (metrics) metrics.modelScopeResolutionMs = Date.now() - scopeStartedAt
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
    patterns && patterns.length > 0 && scopedModels.length > 0
      ? scopedModels.map(({ model }) => modelKey(model))
      : availableModels.map(modelKey)
  )
  const credentialsStartedAt = Date.now()
  const credentials = await credentialsByProvider(state)
  if (metrics) metrics.credentialListingMs = Date.now() - credentialsStartedAt
  const providerSpecs = new Map(
    state.modelRuntime.getProviders().map((provider) => [provider.id, provider])
  )
  const availableModelCounts = new Map<string, number>()
  for (const model of availableModels) {
    availableModelCounts.set(
      model.provider,
      (availableModelCounts.get(model.provider) ?? 0) + 1
    )
  }
  const delegatedRuntime = process.env.PI_SERVER_MODE === "true"
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

  const result: ModelSettingsSnapshot = {
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
        const providerSpec = providerSpecs.get(provider)
        const rawConfig = config.providers[provider]
        const custom = Boolean(rawConfig) && !builtIns.has(provider)
        const modelCount = availableModelCounts.get(provider) ?? 0
        const authPresentation = providerAuthPresentation({
          authStatus,
          ...(credential ? { credentialType: credential.type } : {}),
          providerKnown: providerSpec !== undefined,
          hasOAuthAuth: providerSpec?.auth.oauth !== undefined,
          hasApiKeyAuth: providerSpec?.auth.apiKey !== undefined,
          apiKeyHasLogin: providerSpec?.auth.apiKey?.login !== undefined,
          delegatedRuntime,
        })
        return {
          provider,
          auth: authPresentation.auth,
          authKind: authPresentation.authKind,
          authStatus: authPresentation.authStatus,
          removable: custom || credential !== undefined,
          modelCount,
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
          apiKeyConfigured: authPresentation.apiKeyConfigured,
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
    ...(scopeWarnings.length ? { scopeWarnings } : {}),
  }
  if (metrics)
    metrics.modelSettingsProjectionMs = Date.now() - projectionStartedAt
  return result
}

async function refreshModelSettings(
  state: ModelSettingsState,
  metrics?: Record<string, number>
) {
  await state.settingsManager.reload()
  const refreshStartedAt = Date.now()
  const result = await refreshModelRuntime(state)
  if (metrics) metrics.providerRefreshMs = Date.now() - refreshStartedAt
  const settings = await readModelSettings(state, metrics)
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

// The composer needs only scoped choices, not settings-page provider metadata.
// Session services preserve models registered by trusted project extensions.
async function readScopedModelSettings(
  codingAgent: CodingAgentModule,
  modelThinking: ModelThinkingModule,
  cwd: string,
  agentDir: string,
  metrics?: Record<string, number>
): Promise<ModelSettingsSnapshot> {
  const settingsManager = createSettingsManager(
    codingAgent,
    cwd,
    agentDir,
    projectTrustedForWeb(codingAgent, cwd, agentDir)
  )
  const servicesStartedAt = Date.now()
  const { modelRuntime } = await codingAgent.createAgentSessionServices({
    cwd,
    agentDir,
    settingsManager,
  })
  if (metrics) metrics.servicesInitializationMs = Date.now() - servicesStartedAt
  const patterns = settingsManager.getEnabledModels()
  const scopeStartedAt = Date.now()
  const scope = await resolveConfiguredModelScope(
    codingAgent,
    settingsManager,
    modelRuntime
  )
  if (metrics) metrics.modelScopeResolutionMs = Date.now() - scopeStartedAt
  const availableModels = modelRuntime.getAvailableSnapshot()
  const thinkingLevelsByModel = new Map(
    scope.scopedModels.map(({ model, thinkingLevel }) => [
      modelKey(model),
      thinkingLevel,
    ])
  )
  // Fall back to every available model when the scope matches nothing.
  const scopedModels =
    patterns?.length && scope.scopedModels.length
      ? availableModels.flatMap((model) => {
          const key = modelKey(model)
          return thinkingLevelsByModel.has(key)
            ? [{ model, thinkingLevel: thinkingLevelsByModel.get(key) }]
            : []
        })
      : availableModels.map((model) => ({ model, thinkingLevel: undefined }))
  const defaultThinking = settingsManager.getDefaultThinkingLevel() ?? "medium"
  const projectionStartedAt = Date.now()
  const models = scopedModels.map(({ model, thinkingLevel }) => ({
    ...toRuntimeModel(model),
    enabled: true,
    availableThinkingLevels: modelThinking.getSupportedThinkingLevels(model),
    defaultThinkingLevel: modelThinking.clampThinkingLevel(
      model,
      thinkingLevel ?? defaultThinking
    ),
  }))
  const selected = models.find(
    (model) =>
      model.provider === settingsManager.getDefaultProvider() &&
      model.id === settingsManager.getDefaultModel()
  )
  const result: ModelSettingsSnapshot = {
    models,
    providers: [],
    enabledModels: patterns ?? null,
    defaultModel: selected
      ? { provider: selected.provider, id: selected.id, name: selected.name }
      : null,
    ...(scope.scopeWarnings.length
      ? { scopeWarnings: scope.scopeWarnings }
      : {}),
  }
  if (metrics)
    metrics.modelSettingsProjectionMs = Date.now() - projectionStartedAt
  return result
}

export async function handleModelSettingsMessage(
  codingAgent: CodingAgentModule,
  modelThinking: ModelThinkingModule,
  message: ModelSettingsMessage,
  metrics?: Record<string, number>
) {
  const { cwd, agentDir } = message.payload
  if (
    message.type === "models.catalog" &&
    message.payload.scope === "enabled"
  ) {
    return readScopedModelSettings(
      codingAgent,
      modelThinking,
      cwd,
      agentDir,
      metrics
    )
  }
  const state = await createModelSettingsState(
    codingAgent,
    modelThinking,
    cwd,
    agentDir,
    metrics
  )
  if (message.type === "models.catalog")
    return readModelSettings(state, metrics)
  if (message.type === "models.refresh") {
    return refreshModelSettings(state, metrics)
  }
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
