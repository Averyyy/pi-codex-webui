import type {
  ModelCatalogSnapshot,
  ModelCatalogStore,
  ModelCatalogTarget,
} from "@/lib/model-catalog-store"
import { responseJson } from "@/lib/api-response"
import { parseWebUiExtensionCatalog } from "@/lib/webui-extensions/catalog-schema"
import type { WebUiExtensionCatalogView } from "@/lib/webui-extensions/types"
import {
  dispatchWebUiExtensionCatalogInvalidated,
  dispatchWebUiExtensionCatalogUpdated,
  webUiExtensionCatalogSecurityEpoch,
} from "@/lib/webui-extension-events"
import { measurePerformance } from "@/lib/performance-diagnostics"

export interface CatalogRefreshTarget {
  models: ModelCatalogTarget
  extensionProjectId: string | null
  sessionId?: string
}

export interface CatalogRefreshResult {
  modelSnapshot: ModelCatalogSnapshot | null
  modelRefreshErrors: string[]
  extensionRefreshErrors: string[]
  extensionCatalog: WebUiExtensionCatalogView | null
}

const refreshFlights = new WeakMap<
  ModelCatalogStore,
  Map<string, Promise<CatalogRefreshResult>>
>()

function refreshKey(target: CatalogRefreshTarget) {
  return JSON.stringify([
    target.models.sessionId ?? null,
    target.models.projectId ?? null,
    target.models.newTask === true,
    target.models.defaultTarget === true,
    target.extensionProjectId,
    target.sessionId ?? null,
  ])
}

function errorMessage(failure: unknown) {
  return failure instanceof Error ? failure.message : String(failure)
}

async function refreshExtensionCatalog(
  target: CatalogRefreshTarget,
  mutationToken: string
): Promise<WebUiExtensionCatalogView | null> {
  return measurePerformance("extensionCatalogRefresh", async () => {
    const securityEpoch = webUiExtensionCatalogSecurityEpoch(
      target.extensionProjectId
    )
    const params = new URLSearchParams()
    if (target.extensionProjectId) {
      params.set("projectId", target.extensionProjectId)
    } else {
      params.set("scope", "global")
    }
    if (target.sessionId) params.set("sessionId", target.sessionId)
    const response = await fetch(`/api/v1/webui-extensions?${params}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "X-Pi-Web-Codex-Mutation-Token": mutationToken,
      },
    })
    const catalog = parseWebUiExtensionCatalog(
      await responseJson<unknown>(response)
    )
    if (
      securityEpoch !==
      webUiExtensionCatalogSecurityEpoch(target.extensionProjectId)
    ) {
      return null
    }
    dispatchWebUiExtensionCatalogInvalidated({
      kind: "data-refresh",
      projectId: catalog.projectId,
      catalogIdentity: catalog.catalogIdentity,
      catalogVersion: catalog.catalogVersion,
    })
    dispatchWebUiExtensionCatalogUpdated({
      projectId: catalog.projectId,
      sessionId: target.sessionId,
      catalog,
      securityEpoch,
    })
    return catalog
  })
}

export function refreshModelAndExtensionCatalogs(
  store: ModelCatalogStore,
  target: CatalogRefreshTarget,
  mutationToken: string
): Promise<CatalogRefreshResult> {
  let flights = refreshFlights.get(store)
  if (!flights) {
    flights = new Map()
    refreshFlights.set(store, flights)
  }
  const key = refreshKey(target)
  const existing = flights.get(key)
  if (existing) return existing

  const result: CatalogRefreshResult = {
    modelSnapshot: null,
    modelRefreshErrors: [],
    extensionRefreshErrors: [],
    extensionCatalog: null,
  }
  const operation = Promise.allSettled([
    store.refresh(target.models, mutationToken),
    refreshExtensionCatalog(target, mutationToken),
  ])
    .then(([modelResult, extensionResult]) => {
      if (modelResult.status === "rejected") {
        result.modelRefreshErrors.push(errorMessage(modelResult.reason))
      } else {
        result.modelSnapshot = modelResult.value
        if (modelResult.value.refreshErrors?.length) {
          result.modelRefreshErrors.push(
            ...modelResult.value.refreshErrors.map(
              ({ provider, message }) => `${provider}: ${message}`
            )
          )
        }
      }

      if (extensionResult.status === "rejected") {
        result.extensionRefreshErrors.push(errorMessage(extensionResult.reason))
      } else if (extensionResult.value === null) {
        result.extensionRefreshErrors.push(
          "The extension catalog changed during refresh; the current snapshot is reloading."
        )
      } else {
        result.extensionCatalog = extensionResult.value
        if (extensionResult.value.refreshError) {
          result.extensionRefreshErrors.push(extensionResult.value.refreshError)
        }
        result.extensionRefreshErrors.push(
          ...(extensionResult.value.refreshDiagnostics ?? []).map(
            ({ message }) => message
          )
        )
      }
      return result
    })
    .finally(() => {
      if (flights?.get(key) === operation) flights.delete(key)
    })
  flights.set(key, operation)
  return operation
}
