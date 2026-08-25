export interface ResourceItem {
  id: string
  type: "search" | "fetch" | "source_check" | "other"
  title: string
  url?: string
  timestamp: number
  status?: "pending" | "complete" | "error"
}

export interface ResourceCenterViewState {
  resources: ResourceItem[]
  totalCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isResourceItem(value: unknown): value is ResourceItem {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string") return false
  if (value.type !== "search" && value.type !== "fetch" && value.type !== "source_check" && value.type !== "other") return false
  if (typeof value.title !== "string") return false
  if (value.url !== undefined && typeof value.url !== "string") return false
  if (typeof value.timestamp !== "number") return false
  if (value.status !== undefined && value.status !== "pending" && value.status !== "complete" && value.status !== "error") return false
  return true
}

export function isResourceCenterViewState(value: unknown): value is ResourceCenterViewState {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.resources)) return false
  if (!value.resources.every(isResourceItem)) return false
  if (typeof value.totalCount !== "number") return false
  return true
}

export function extractResourceCenterState(details: unknown): ResourceCenterViewState | undefined {
  if (!isRecord(details)) return undefined
  if (!Array.isArray(details.resources)) return undefined
  
  const resources = details.resources.filter(isResourceItem)
  const totalCount = typeof details.totalCount === "number" ? details.totalCount : resources.length
  
  return { resources, totalCount }
}
