import type { WebUiExtensionCatalogView } from "@/lib/webui-extensions/types"

export const WEBUI_EXTENSION_CATALOG_UPDATED =
  "pi-web-codex:webui-extension-catalog-updated"
export const WEBUI_EXTENSION_CATALOG_INVALIDATED =
  "pi-web-codex:webui-extension-catalog-invalidated"

export interface WebUiExtensionCatalogUpdatedDetail {
  projectId: string | null
  sessionId?: string
  catalog: WebUiExtensionCatalogView
  securityEpoch?: string
}

export interface WebUiExtensionCatalogInvalidatedDetail {
  kind?: "data-refresh" | "invalidate"
  projectId: string | null
  catalogIdentity?: string
  catalogVersion?: string
}

let globalInvalidationEpoch = 0
const MAX_PROJECT_EPOCHS = 128
const projectInvalidationEpochs = new Map<string, number>()

export function webUiExtensionCatalogSecurityEpoch(projectId: string | null) {
  return JSON.stringify([
    globalInvalidationEpoch,
    projectId === null ? 0 : (projectInvalidationEpochs.get(projectId) ?? 0),
  ])
}

export function dispatchWebUiExtensionCatalogUpdated(
  detail: WebUiExtensionCatalogUpdatedDetail
) {
  window.dispatchEvent(
    new CustomEvent<WebUiExtensionCatalogUpdatedDetail>(
      WEBUI_EXTENSION_CATALOG_UPDATED,
      { detail }
    )
  )
}

export function dispatchWebUiExtensionCatalogInvalidated(
  detail: WebUiExtensionCatalogInvalidatedDetail
) {
  if (detail.kind !== "data-refresh") {
    if (detail.projectId === null) {
      globalInvalidationEpoch += 1
      projectInvalidationEpochs.clear()
    } else {
      if (
        !projectInvalidationEpochs.has(detail.projectId) &&
        projectInvalidationEpochs.size >= MAX_PROJECT_EPOCHS
      ) {
        globalInvalidationEpoch += 1
        projectInvalidationEpochs.clear()
      }
      projectInvalidationEpochs.set(
        detail.projectId,
        (projectInvalidationEpochs.get(detail.projectId) ?? 0) + 1
      )
    }
  }
  window.dispatchEvent(
    new CustomEvent<WebUiExtensionCatalogInvalidatedDetail>(
      WEBUI_EXTENSION_CATALOG_INVALIDATED,
      { detail }
    )
  )
}
