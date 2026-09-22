export const SESSION_CATALOG_CHANGED = "pi-web-codex:session-catalog-changed"

export interface SessionCatalogChangedDetail {
  scope?: "tasks" | "pinned" | "project"
  projectId?: string
}
