import type { ModelCatalogTarget } from "@/lib/model-catalog-store"

export const MODEL_CATALOG_INVALIDATED =
  "pi-web-codex:model-catalog-invalidated"

export interface ModelCatalogInvalidatedDetail {
  kind?: "data-refresh" | "invalidate"
  target?: ModelCatalogTarget
  catalogIdentity?: string
  catalogVersion?: string
  reason?: string
  all?: true
}

export function dispatchModelCatalogInvalidated(
  detail: ModelCatalogInvalidatedDetail
) {
  if (detail.all !== true && !detail.target && !detail.catalogIdentity) {
    throw new Error("Model catalog invalidation requires a target or identity.")
  }
  window.dispatchEvent(
    new CustomEvent<ModelCatalogInvalidatedDetail>(MODEL_CATALOG_INVALIDATED, {
      detail,
    })
  )
}
