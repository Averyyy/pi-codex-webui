export interface NotifyViewState {
  title: string
  body?: string
  icon?: string
  tag?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isNotifyViewState(value: unknown): value is NotifyViewState {
  if (!isRecord(value)) return false
  if (typeof value.title !== "string") return false
  if (value.body !== undefined && typeof value.body !== "string") return false
  if (value.icon !== undefined && typeof value.icon !== "string") return false
  if (value.tag !== undefined && typeof value.tag !== "string") return false
  return true
}

export function extractNotifyState(details: unknown): NotifyViewState | undefined {
  if (!isRecord(details)) return undefined
  if (typeof details.title !== "string") return undefined
  
  const state: NotifyViewState = { title: details.title }
  if (typeof details.body === "string") state.body = details.body
  if (typeof details.icon === "string") state.icon = details.icon
  if (typeof details.tag === "string") state.tag = details.tag
  
  return state
}
