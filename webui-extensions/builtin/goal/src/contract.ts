export const GOAL_STATUSES = [
  "active",
  "queued",
  "paused",
  "blocked",
  "usage_limited",
  "budget_limited",
  "complete",
] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]

export interface GoalViewGoal {
  id: string
  text: string
  status: GoalStatus
  startedAt: number
  updatedAt: number
  iteration: number
  tokenBudget?: number
  tokensUsed: number
  timeUsedSeconds: number
  activeStartedAt?: number
}

export interface GoalViewState {
  statusText: string
  goal: GoalViewGoal
  queue: GoalViewGoal[]
}

export type GoalActionInput =
  | { command: "pause" | "resume" | "clear" }
  | { command: "edit"; objective: string; tokenBudget?: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isGoal(value: unknown): value is GoalViewGoal {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.text === "string" &&
    (GOAL_STATUSES as readonly unknown[]).includes(value.status) &&
    typeof value.startedAt === "number" &&
    typeof value.updatedAt === "number" &&
    typeof value.iteration === "number" &&
    typeof value.tokensUsed === "number" &&
    typeof value.timeUsedSeconds === "number" &&
    (value.tokenBudget === undefined ||
      typeof value.tokenBudget === "number") &&
    (value.activeStartedAt === undefined ||
      typeof value.activeStartedAt === "number")
  )
}

export function goalViewState(
  data: unknown,
  statusText: unknown
): GoalViewState | undefined {
  if (!isRecord(data) || !isGoal(data.goal) || typeof statusText !== "string") {
    return undefined
  }
  const queue = data.queue === undefined ? [] : data.queue
  if (!Array.isArray(queue) || !queue.every(isGoal)) return undefined
  return { statusText, goal: data.goal, queue }
}

export function isGoalViewState(value: unknown): value is GoalViewState {
  if (!isRecord(value) || typeof value.statusText !== "string") return false
  return (
    isGoal(value.goal) &&
    Array.isArray(value.queue) &&
    value.queue.every(isGoal)
  )
}

export function isGoalActionInput(value: unknown): value is GoalActionInput {
  if (!isRecord(value)) return false
  if (["pause", "resume", "clear"].includes(String(value.command))) {
    return Object.keys(value).length === 1
  }
  return (
    value.command === "edit" &&
    typeof value.objective === "string" &&
    value.objective.trim().length > 0 &&
    value.objective.length <= 4_000 &&
    (value.tokenBudget === undefined ||
      (Number.isSafeInteger(value.tokenBudget) &&
        Number(value.tokenBudget) > 0))
  )
}
