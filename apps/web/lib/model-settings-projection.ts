import type { ModelSettings } from "@workspace/runtime-protocol"

export type ModelSettingsProjectionInput = ModelSettings

export function projectEnabledModelSettings(
  settings: ModelSettingsProjectionInput
) {
  const models = settings.models
    .filter((model) => model.enabled)
    .map((model) => ({ ...model, enabled: true }))
  const enabledModelKeys = new Set(
    models.map((model) => `${model.provider}/${model.id}`)
  )
  const defaultModel = settings.defaultModel
  return {
    ...settings,
    models,
    providers: [],
    defaultModel:
      defaultModel &&
      enabledModelKeys.has(`${defaultModel.provider}/${defaultModel.id}`)
        ? defaultModel
        : null,
  }
}
