export interface MermaidIssue {
  severity: "warning" | "error"
  message: string
}

export interface MermaidViewState {
  source: string
  issues?: MermaidIssue[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isMermaidViewState(value: unknown): value is MermaidViewState {
  if (!isRecord(value) || typeof value.source !== "string") return false
  if (value.issues !== undefined) {
    if (!Array.isArray(value.issues)) return false
    return value.issues.every(
      (issue) =>
        isRecord(issue) &&
        typeof issue.message === "string" &&
        (issue.severity === "warning" || issue.severity === "error")
    )
  }
  return true
}

export function extractMermaidState(
  details: unknown
): MermaidViewState | undefined {
  if (!isRecord(details) || typeof details.source !== "string") return undefined
  const state: MermaidViewState = { source: details.source }
  if (Array.isArray(details.issues)) {
    state.issues = details.issues.filter(
      (issue) =>
        isRecord(issue) &&
        typeof issue.message === "string" &&
        (issue.severity === "warning" || issue.severity === "error")
    ) as MermaidIssue[]
  }
  return state
}
