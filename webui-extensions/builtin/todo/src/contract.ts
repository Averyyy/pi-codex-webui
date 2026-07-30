export type TodoStatus = "pending" | "in_progress" | "completed" | "deleted"

export interface TodoTask {
  id: number
  subject: string
  description?: string
  activeForm?: string
  status: TodoStatus
  blockedBy?: number[]
  owner?: string
}

export interface TodoState {
  tasks: TodoTask[]
  nextId: number
  output?: string
  error?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function parseStatus(value: unknown): TodoStatus {
  if (
    value !== "pending" &&
    value !== "in_progress" &&
    value !== "completed" &&
    value !== "deleted"
  ) {
    throw new TypeError("Invalid todo status.")
  }
  return value
}

function parseTask(value: unknown): TodoTask {
  const input = record(value)
  if (
    !input ||
    typeof input.id !== "number" ||
    !Number.isInteger(input.id) ||
    typeof input.subject !== "string"
  ) {
    throw new TypeError("Invalid todo task.")
  }
  const blockedBy =
    input.blockedBy === undefined
      ? undefined
      : Array.isArray(input.blockedBy) &&
          input.blockedBy.every(
            (id) => typeof id === "number" && Number.isInteger(id)
          )
        ? [...input.blockedBy]
        : null
  if (blockedBy === null) throw new TypeError("Invalid todo dependencies.")
  return {
    id: input.id,
    subject: input.subject,
    status: parseStatus(input.status),
    ...(typeof input.description === "string"
      ? { description: input.description }
      : {}),
    ...(typeof input.activeForm === "string"
      ? { activeForm: input.activeForm }
      : {}),
    ...(blockedBy ? { blockedBy } : {}),
    ...(typeof input.owner === "string" ? { owner: input.owner } : {}),
  }
}

function resultText(value: Record<string, unknown>) {
  const content = Array.isArray(value.content) ? value.content : []
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

export function parseTodoToolResult(value: unknown): TodoState {
  const result = record(value)
  const details = record(result?.details)
  if (
    !result ||
    !details ||
    !Array.isArray(details.tasks) ||
    typeof details.nextId !== "number" ||
    !Number.isInteger(details.nextId)
  ) {
    throw new TypeError("Invalid todo tool result.")
  }
  const text = resultText(result)
  return {
    tasks: details.tasks.map(parseTask),
    nextId: details.nextId,
    ...(typeof details.error === "string"
      ? { error: details.error }
      : text
        ? { output: text }
        : {}),
  }
}

export function parseTodoState(value: unknown): TodoState {
  const input = record(value)
  if (
    !input ||
    !Array.isArray(input.tasks) ||
    typeof input.nextId !== "number" ||
    !Number.isInteger(input.nextId)
  ) {
    throw new TypeError("Invalid todo view state.")
  }
  return {
    tasks: input.tasks.map(parseTask),
    nextId: input.nextId,
    ...(typeof input.output === "string" ? { output: input.output } : {}),
    ...(typeof input.error === "string" ? { error: input.error } : {}),
  }
}
