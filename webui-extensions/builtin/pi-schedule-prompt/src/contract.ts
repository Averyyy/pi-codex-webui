export type ScheduledPromptMode =
  | "prompt"
  | "subagent_start"
  | "subagent_done"
  | "subagent_error"

export interface ScheduledPromptViewState {
  jobName: string
  prompt?: string
  model?: string
  mode: ScheduledPromptMode
  output?: string
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isScheduledPromptViewState(value: unknown): value is ScheduledPromptViewState {
  if (!isRecord(value)) return false
  if (typeof value.jobName !== "string") return false
  if (value.prompt !== undefined && typeof value.prompt !== "string") return false
  if (value.model !== undefined && typeof value.model !== "string") return false
  if (
    value.mode !== "prompt" &&
    value.mode !== "subagent_start" &&
    value.mode !== "subagent_done" &&
    value.mode !== "subagent_error"
  )
    return false
  if (value.output !== undefined && typeof value.output !== "string") return false
  if (value.error !== undefined && typeof value.error !== "string") return false
  return true
}

export function extractScheduledPromptState(
  payload: unknown
): ScheduledPromptViewState | undefined {
  const container = isRecord(payload) ? payload : undefined
  const message = isRecord(container?.message) ? container.message : undefined
  if (message?.customType !== "scheduled_prompt") return undefined
  const details = isRecord(message.details) ? message.details : undefined
  if (!isRecord(details)) return undefined
  if (typeof details.jobName !== "string") return undefined
  const mode = details.mode ?? "prompt"
  if (
    mode !== "prompt" &&
    mode !== "subagent_start" &&
    mode !== "subagent_done" &&
    mode !== "subagent_error"
  )
    return undefined
  
  const state: ScheduledPromptViewState = {
    jobName: details.jobName,
    mode,
  }
  
  if (typeof details.prompt === "string") state.prompt = details.prompt
  if (typeof details.model === "string") state.model = details.model
  if (typeof details.output === "string") state.output = details.output
  if (typeof details.error === "string") state.error = details.error
  
  return state
}
