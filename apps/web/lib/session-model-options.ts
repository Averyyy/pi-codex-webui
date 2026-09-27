import type { ModelCatalogState } from "@/lib/model-catalog-store"

const EMPTY_MODEL_OPTIONS: NonNullable<
  ModelCatalogState["snapshot"]
>["models"] = []

export function sessionModelOptions(catalog: ModelCatalogState) {
  return catalog.snapshot?.models ?? EMPTY_MODEL_OPTIONS
}
