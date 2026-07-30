export const INTERCOM_ACTIONS = [
  "send",
  "ask",
  "reply",
  "pending",
  "status",
  "list",
  "list-cwd",
  "cancel",
] as const

export type IntercomAction = (typeof INTERCOM_ACTIONS)[number]

export interface IntercomState {
  peers: string
  output?: string
  error?: string
  draft?: string
}

export interface IntercomActionInput {
  action: IntercomAction
  to?: string
  message?: string
  replyTo?: string
  messageId?: string
  cwd?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function parseIntercomState(value: unknown): IntercomState {
  const input = record(value)
  if (!input || typeof input.peers !== "string") {
    throw new TypeError("Invalid intercom view state.")
  }
  return {
    peers: input.peers,
    ...(typeof input.output === "string" ? { output: input.output } : {}),
    ...(typeof input.error === "string" ? { error: input.error } : {}),
    ...(typeof input.draft === "string" ? { draft: input.draft } : {}),
  }
}

export function parseIntercomActionInput(value: unknown): IntercomActionInput {
  const input = record(value)
  if (
    !input ||
    typeof input.action !== "string" ||
    !INTERCOM_ACTIONS.includes(input.action as IntercomAction)
  ) {
    throw new TypeError("Invalid intercom action.")
  }
  const result: IntercomActionInput = {
    action: input.action as IntercomAction,
  }
  for (const key of ["to", "message", "replyTo", "messageId", "cwd"] as const) {
    const field = input[key]
    if (field !== undefined) {
      if (typeof field !== "string") {
        throw new TypeError(`Invalid intercom ${key}.`)
      }
      const trimmed = field.trim()
      if (trimmed) result[key] = trimmed
    }
  }
  return result
}

export function toolText(value: unknown) {
  const result = record(value)
  const content = Array.isArray(result?.content) ? result.content : []
  return content
    .map((item) => {
      const part = record(item)
      return part?.type === "text" && typeof part.text === "string"
        ? part.text
        : ""
    })
    .filter(Boolean)
    .join("\n")
}

export function toolFailed(value: unknown) {
  const result = record(value)
  const details = record(result?.details)
  return (
    result?.isError === true ||
    details?.error === true ||
    details?.delivered === false
  )
}
