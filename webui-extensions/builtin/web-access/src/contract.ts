export const WEB_ACCESS_WORKFLOWS = [
  {
    value: "summary-review",
    label: "人工筛选并确认摘要",
    description: "搜索完成后打开 Curator，选择来源并确认摘要。",
  },
  {
    value: "auto-summary",
    label: "自动生成摘要",
    description: "无需打开 Curator，搜索后直接生成摘要。",
  },
  {
    value: "none",
    label: "直接返回结果",
    description: "不生成摘要，也不打开 Curator。",
  },
] as const

export type WebAccessWorkflow = (typeof WEB_ACCESS_WORKFLOWS)[number]["value"]

export interface WebSearchState {
  queries: string[]
}

export interface WorkflowState {
  workflows: typeof WEB_ACCESS_WORKFLOWS
}

export type WebSearchResult = { queries: string[] } | { cancelled: true }
export type WorkflowResult =
  { workflow: WebAccessWorkflow } | { cancelled: true }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseWebSearchState(value: unknown): WebSearchState {
  if (
    !isRecord(value) ||
    !Array.isArray(value.queries) ||
    value.queries.some((query) => typeof query !== "string")
  ) {
    throw new TypeError("Invalid web-search state.")
  }
  return value as unknown as WebSearchState
}

export function parseWorkflowState(value: unknown): WorkflowState {
  if (
    !isRecord(value) ||
    !Array.isArray(value.workflows) ||
    value.workflows.length !== WEB_ACCESS_WORKFLOWS.length ||
    value.workflows.some((workflow, index) => {
      const expected = WEB_ACCESS_WORKFLOWS[index]
      if (!expected) return true
      return (
        !isRecord(workflow) ||
        workflow.value !== expected.value ||
        workflow.label !== expected.label ||
        workflow.description !== expected.description
      )
    })
  ) {
    throw new TypeError("Invalid web-access workflow state.")
  }
  return value as unknown as WorkflowState
}

export function parseWebSearchResult(value: unknown): WebSearchResult {
  if (!isRecord(value)) throw new TypeError("Invalid web-search result.")
  if (value.cancelled === true) return { cancelled: true }
  if (
    Array.isArray(value.queries) &&
    value.queries.length > 0 &&
    value.queries.every(
      (query) => typeof query === "string" && query.length > 0
    )
  ) {
    return { queries: value.queries }
  }
  throw new TypeError("Invalid web-search result.")
}

export function parseWorkflowResult(value: unknown): WorkflowResult {
  if (!isRecord(value)) throw new TypeError("Invalid workflow result.")
  if (value.cancelled === true) return { cancelled: true }
  if (
    typeof value.workflow === "string" &&
    WEB_ACCESS_WORKFLOWS.some((workflow) => workflow.value === value.workflow)
  ) {
    return { workflow: value.workflow as WebAccessWorkflow }
  }
  throw new TypeError("Invalid workflow result.")
}
