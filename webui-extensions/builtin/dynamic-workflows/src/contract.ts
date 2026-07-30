export interface WorkflowRun {
  runId: string
  workflowName: string
  status: string
  phase: string | null
  counts: {
    total: number
    done: number
    running: number
    queued: number
    error: number
    skipped: number
  }
  activeLabels: string[]
  tokenTotal: number
}

export interface WorkflowState {
  runs: WorkflowRun[]
  output?: string
  error?: string
}

export interface WorkflowControlInput {
  action: "refresh" | "pause" | "resume" | "stop"
  runId?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Invalid workflow ${field}.`)
  }
  return value
}

function parseRun(value: unknown): WorkflowRun {
  const input = record(value)
  const counts = record(input?.counts)
  if (
    !input ||
    !counts ||
    typeof input.runId !== "string" ||
    typeof input.workflowName !== "string" ||
    typeof input.status !== "string" ||
    (input.phase !== null && typeof input.phase !== "string") ||
    !Array.isArray(input.activeLabels) ||
    !input.activeLabels.every((label) => typeof label === "string")
  ) {
    throw new TypeError("Invalid workflow run.")
  }
  return {
    runId: input.runId,
    workflowName: input.workflowName,
    status: input.status,
    phase: input.phase,
    counts: {
      total: finiteNumber(counts.total, "total count"),
      done: finiteNumber(counts.done, "done count"),
      running: finiteNumber(counts.running, "running count"),
      queued: finiteNumber(counts.queued, "queued count"),
      error: finiteNumber(counts.error, "error count"),
      skipped: finiteNumber(counts.skipped, "skipped count"),
    },
    activeLabels: [...input.activeLabels],
    tokenTotal: finiteNumber(input.tokenTotal, "token total"),
  }
}

export function parseWorkflowRuns(value: unknown): WorkflowRun[] {
  const result = record(value)
  const details = record(result?.details)
  if (
    details?.action !== "list" ||
    details.result !== "ok" ||
    !Array.isArray(details.runs)
  ) {
    throw new TypeError("Invalid workflow_control list result.")
  }
  return details.runs.map(parseRun)
}

export function parseWorkflowState(value: unknown): WorkflowState {
  const input = record(value)
  if (!input || !Array.isArray(input.runs)) {
    throw new TypeError("Invalid workflow view state.")
  }
  return {
    runs: input.runs.map(parseRun),
    ...(typeof input.output === "string" ? { output: input.output } : {}),
    ...(typeof input.error === "string" ? { error: input.error } : {}),
  }
}

export function parseWorkflowControlInput(
  value: unknown
): WorkflowControlInput {
  const input = record(value)
  if (
    !input ||
    typeof input.action !== "string" ||
    !["refresh", "pause", "resume", "stop"].includes(input.action)
  ) {
    throw new TypeError("Invalid workflow control action.")
  }
  if (
    input.action !== "refresh" &&
    (typeof input.runId !== "string" || !input.runId.trim())
  ) {
    throw new TypeError(`Workflow ${input.action} requires a run ID.`)
  }
  return {
    action: input.action as WorkflowControlInput["action"],
    ...(typeof input.runId === "string" ? { runId: input.runId.trim() } : {}),
  }
}

export function parseWorkflowDialogResult(value: unknown) {
  const input = record(value)
  return input && typeof input.commandArgs === "string"
    ? { commandArgs: input.commandArgs.trim() }
    : { commandArgs: "" }
}

export function toolFeedback(value: unknown) {
  const result = record(value)
  const details = record(result?.details)
  const content = Array.isArray(result?.content) ? result.content : []
  const text = content
    .map((item) => {
      const part = record(item)
      return part?.type === "text" && typeof part.text === "string"
        ? part.text
        : ""
    })
    .filter(Boolean)
    .join("\n")
  return details?.result === "error"
    ? { error: typeof details.error === "string" ? details.error : text }
    : { output: text }
}
