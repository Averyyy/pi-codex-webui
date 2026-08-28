export const ASK_USER_TOOL = "ask_user"
export const ASK_USER_BLOCKED_EVENT = "herdr:blocked"
export const ASK_USER_ANSWERED_EVENT = "ask:answered"
export const ASK_USER_CANCELLED_EVENT = "ask:cancelled"

export interface AskOption {
  title: string
  description?: string
}

export interface AskParams {
  question: string
  context?: string
  options: AskOption[]
  allowMultiple: boolean
  allowFreeform: boolean
  allowComment: boolean
  timeout?: number
}

export type AskResponse =
  | { kind: "selection"; selections: string[]; comment?: string }
  | { kind: "freeform"; text: string }

export interface AskDialogResult {
  cancelled: boolean
  response?: AskResponse
}

const OPTION_TITLE_KEYS = [
  "title",
  "label",
  "text",
  "value",
  "name",
  "option",
] as const

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new TypeError(`Invalid ask_user ${field}.`)
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function optionalBoolean(value: unknown, field: string, fallback: boolean) {
  if (value === undefined) return fallback
  if (typeof value !== "boolean") {
    throw new TypeError(`Invalid ask_user ${field}.`)
  }
  return value
}

function booleanPreference(value: string | undefined) {
  switch (value?.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true
    case "0":
    case "false":
    case "no":
    case "off":
      return false
    default:
      return undefined
  }
}

function option(value: unknown): AskOption | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const title = String(value).trim()
    return title ? { title } : null
  }
  const item = record(value)
  if (!item) return null
  for (const key of OPTION_TITLE_KEYS) {
    const rawTitle = item[key]
    if (typeof rawTitle !== "string" || !rawTitle.trim()) continue
    const description = optionalString(item.description, "option description")
    return {
      title: rawTitle.trim(),
      ...(description ? { description } : {}),
    }
  }
  return null
}

export function parseAskParams(value: unknown): AskParams {
  const params = record(value)
  if (!params || typeof params.question !== "string") {
    throw new TypeError("Invalid ask_user question.")
  }
  const question = params.question.trim()
  if (!question) throw new TypeError("Invalid ask_user question.")
  const rawOptions = params.options === undefined ? [] : params.options
  if (!Array.isArray(rawOptions)) {
    throw new TypeError("Invalid ask_user options.")
  }
  const options = rawOptions
    .map(option)
    .filter((item): item is AskOption => item !== null)
  if (rawOptions.length > 0 && options.length === 0) {
    throw new TypeError("Malformed options: no entry had a usable title")
  }
  const timeout = params.timeout
  if (timeout !== undefined && typeof timeout !== "number") {
    throw new TypeError("Invalid ask_user timeout.")
  }
  const context = optionalString(params.context, "context")
  const allowFreeform = optionalBoolean(
    params.allowFreeform,
    "allowFreeform",
    true
  )
  const envAllowComment =
    typeof process === "undefined"
      ? undefined
      : process.env.PI_ASK_USER_ALLOW_COMMENT
  return {
    question,
    ...(context ? { context } : {}),
    options,
    allowMultiple: optionalBoolean(
      params.allowMultiple,
      "allowMultiple",
      false
    ),
    allowFreeform: options.length === 0 ? true : allowFreeform,
    allowComment: optionalBoolean(
      params.allowComment,
      "allowComment",
      booleanPreference(envAllowComment) ?? false
    ),
    ...(timeout !== undefined && timeout > 0 ? { timeout } : {}),
  }
}

function parseResponse(value: unknown, params: AskParams): AskResponse {
  const response = record(value)
  if (!response) throw new TypeError("Invalid ask_user dialog response.")
  if (response.kind === "freeform") {
    if (!params.allowFreeform || typeof response.text !== "string") {
      throw new TypeError("Invalid ask_user freeform response.")
    }
    const text = response.text.trim()
    if (!text) throw new TypeError("Invalid ask_user freeform response.")
    return { kind: "freeform", text }
  }
  if (response.kind !== "selection" || !Array.isArray(response.selections)) {
    throw new TypeError("Invalid ask_user selection response.")
  }
  const allowed = new Set(params.options.map((item) => item.title))
  const selections = [
    ...new Set(
      response.selections.map((selection) => {
        if (typeof selection !== "string" || !allowed.has(selection)) {
          throw new TypeError("Invalid ask_user selected option.")
        }
        return selection
      })
    ),
  ]
  if (!selections.length || (!params.allowMultiple && selections.length > 1)) {
    throw new TypeError("Invalid ask_user selection response.")
  }
  const comment = params.allowComment
    ? optionalString(response.comment, "comment")
    : undefined
  return {
    kind: "selection",
    selections,
    ...(comment ? { comment } : {}),
  }
}

export function parseAskDialogResult(
  value: unknown,
  params: AskParams
): AskDialogResult {
  if (value === undefined || value === null) return { cancelled: true }
  const result = record(value)
  if (!result || typeof result.cancelled !== "boolean") {
    throw new TypeError("Invalid ask_user dialog result.")
  }
  if (result.cancelled) return { cancelled: true }
  return { cancelled: false, response: parseResponse(result.response, params) }
}

function responseSummary(response: AskResponse) {
  if (response.kind === "freeform") return response.text
  const selections = response.selections.join(", ")
  return response.comment ? `${selections} — ${response.comment}` : selections
}

export function buildToolResult(params: AskParams, result: AskDialogResult) {
  if (result.cancelled || !result.response) {
    return {
      content: [{ type: "text", text: "User cancelled the question" }],
      details: {
        question: params.question,
        ...(params.context ? { context: params.context } : {}),
        options: params.options,
        response: null,
        cancelled: true,
      },
    }
  }
  return {
    content: [
      {
        type: "text",
        text: `User answered: ${responseSummary(result.response)}`,
      },
    ],
    details: {
      question: params.question,
      ...(params.context ? { context: params.context } : {}),
      options: params.options,
      response: result.response,
      cancelled: false,
    },
  }
}
