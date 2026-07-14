import path from "node:path"

import type {
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from "@earendil-works/pi-coding-agent"
import type {
  HostToWorkerMessage,
  ModelSettings,
  RuntimeModel,
} from "@workspace/runtime-protocol"

import { createSettingsManager } from "./settings.js"
import type { CodingAgentModule } from "./coding-agent.js"

type ModelSettingsMessage = Extract<
  HostToWorkerMessage,
  { type: "models.catalog" | "models.set-scope" | "providers.remove" }
>

interface ModelSettingsState {
  codingAgent: CodingAgentModule
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
  settingsManager: SettingsManager
}

function modelKey(model: { provider: string; id: string }) {
  return `${model.provider}/${model.id}`
}

export async function resolveConfiguredScopedModels(
  codingAgent: CodingAgentModule,
  settingsManager: Pick<SettingsManager, "getEnabledModels">,
  modelRegistry: ModelRegistry
) {
  const patterns = settingsManager.getEnabledModels()
  if (!patterns || patterns.length === 0) return []
  return (
    await codingAgent.resolveModelScopeWithDiagnostics(patterns, modelRegistry)
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

function createModelSettingsState(
  codingAgent: CodingAgentModule,
  cwd: string,
  agentDir: string
): ModelSettingsState {
  const resolvedAgentDir = path.resolve(agentDir)
  const authStorage = codingAgent.AuthStorage.create(
    path.join(resolvedAgentDir, "auth.json")
  )
  return {
    codingAgent,
    authStorage,
    modelRegistry: codingAgent.ModelRegistry.create(
      authStorage,
      path.join(resolvedAgentDir, "models.json")
    ),
    settingsManager: createSettingsManager(codingAgent, cwd, agentDir, false),
  }
}

async function readModelSettings(
  state: ModelSettingsState
): Promise<ModelSettings> {
  const availableModels = state.modelRegistry.getAvailable()
  const patterns = state.settingsManager.getEnabledModels()
  const scopedModels = await resolveConfiguredScopedModels(
    state.codingAgent,
    state.settingsManager,
    state.modelRegistry
  )
  const enabledIds = new Set(
    patterns && patterns.length > 0
      ? scopedModels.map(({ model }) => modelKey(model))
      : availableModels.map(modelKey)
  )
  const providers = new Set([
    ...availableModels.map((model) => model.provider),
    ...state.authStorage.list(),
  ])

  return {
    models: availableModels.map((model) => ({
      ...toRuntimeModel(model),
      enabled: enabledIds.has(modelKey(model)),
    })),
    providers: [...providers]
      .sort((left, right) => left.localeCompare(right))
      .map((provider) => {
        const credential = state.authStorage.get(provider)
        return {
          provider,
          auth:
            credential?.type === "oauth"
              ? ("oauth" as const)
              : credential
                ? ("api-key" as const)
                : ("environment" as const),
          removable: state.authStorage.has(provider),
          modelCount: availableModels.filter(
            (model) => model.provider === provider
          ).length,
        }
      }),
    enabledModels: patterns ?? null,
  }
}

async function setModelScope(
  state: ModelSettingsState,
  enabledModelIds: string[] | null
) {
  const availableModels = state.modelRegistry.getAvailable()
  const availableIds = new Set(availableModels.map(modelKey))

  if (enabledModelIds === null) {
    state.settingsManager.setEnabledModels(undefined)
  } else {
    if (new Set(enabledModelIds).size !== enabledModelIds.length) {
      throw new Error("Model scope cannot contain duplicate models.")
    }
    const invalid = enabledModelIds.find((id) => !availableIds.has(id))
    if (invalid) throw new Error(`Model ${invalid} is not available.`)
    state.settingsManager.setEnabledModels(
      enabledModelIds.length === availableModels.length
        ? undefined
        : [...enabledModelIds]
    )
  }

  await state.settingsManager.flush()
  return readModelSettings(state)
}

async function removeProvider(state: ModelSettingsState, provider: string) {
  if (!state.authStorage.has(provider)) {
    throw new Error(
      `Provider ${provider} is not stored in Pi auth.json and cannot be deleted here.`
    )
  }
  state.authStorage.remove(provider)
  state.modelRegistry.refresh()
  return readModelSettings(state)
}

export function handleModelSettingsMessage(
  codingAgent: CodingAgentModule,
  message: ModelSettingsMessage
) {
  const { cwd, agentDir } = message.payload
  const state = createModelSettingsState(codingAgent, cwd, agentDir)
  if (message.type === "models.catalog") return readModelSettings(state)
  if (message.type === "models.set-scope") {
    return setModelScope(state, message.payload.enabledModelIds)
  }
  return removeProvider(state, message.payload.provider)
}
