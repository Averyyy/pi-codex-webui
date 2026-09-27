import type {
  ModelSettings,
  ModelSettingsModel,
  ThinkingLevel,
} from "@workspace/runtime-protocol"

export interface NewConversationModelSelection {
  projectId: string | null
  catalogIdentity: string | null
  model: ModelSettingsModel | null
  thinkingLevel: ThinkingLevel | null
}

function modelKey(model: Pick<ModelSettingsModel, "provider" | "id">) {
  return `${model.provider}/${model.id}`
}

function enabledModels(settings: ModelSettings | null) {
  return (settings?.models ?? []).filter((model) => model.enabled)
}

function initialModel(
  settings: ModelSettings | null,
  models = enabledModels(settings)
) {
  return (
    models.find(
      (model) =>
        settings?.defaultModel != null &&
        modelKey(model) === modelKey(settings.defaultModel)
    ) ??
    models[0] ??
    null
  )
}

export function reconcileNewConversationModelSelection(
  current: NewConversationModelSelection,
  projectId: string | null,
  settings: ModelSettings | null
): NewConversationModelSelection {
  const targetChanged = current.projectId !== projectId
  if (!settings) {
    if (!targetChanged) return current
    return {
      projectId,
      catalogIdentity: null,
      model: null,
      thinkingLevel: null,
    }
  }

  const models = enabledModels(settings)
  const sameCatalogIdentity =
    !targetChanged && current.catalogIdentity === settings.catalogIdentity
  const previous =
    sameCatalogIdentity && current.model
      ? (models.find(
          (candidate) => modelKey(candidate) === modelKey(current.model!)
        ) ?? null)
      : null
  const model = previous ?? initialModel(settings, models)
  const thinkingLevel =
    previous &&
    current.thinkingLevel &&
    previous.availableThinkingLevels.includes(current.thinkingLevel)
      ? current.thinkingLevel
      : (model?.defaultThinkingLevel ?? null)

  if (
    !targetChanged &&
    current.catalogIdentity === settings.catalogIdentity &&
    current.model === model &&
    current.thinkingLevel === thinkingLevel
  ) {
    return current
  }

  return {
    projectId,
    catalogIdentity: settings.catalogIdentity,
    model,
    thinkingLevel,
  }
}
