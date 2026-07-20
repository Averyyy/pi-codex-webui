import { z } from "zod"

const goalStatusSchema = z.enum([
  "active",
  "queued",
  "paused",
  "blocked",
  "usage_limited",
  "budget_limited",
  "complete",
])

const piGoalSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  status: goalStatusSchema,
  startedAt: z.number(),
  updatedAt: z.number(),
  iteration: z.number().int().nonnegative(),
  tokenBudget: z.number().positive().optional(),
  tokensUsed: z.number().nonnegative(),
  timeUsedSeconds: z.number().nonnegative(),
  activeStartedAt: z.number().optional(),
})

export const piGoalStateSchema = z.object({
  goal: piGoalSchema,
  queue: z.array(piGoalSchema).default([]),
})

export type PiGoalState = z.infer<typeof piGoalStateSchema>
export type PiGoalStatus = z.infer<typeof goalStatusSchema>

export function latestPiGoalState(entries: unknown[]) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("type" in entry) ||
      entry.type !== "custom" ||
      !("customType" in entry) ||
      entry.customType !== "goal-state" ||
      !("data" in entry)
    ) {
      continue
    }
    const data = entry.data
    if (
      typeof data === "object" &&
      data !== null &&
      "goal" in data &&
      data.goal === null
    ) {
      return null
    }
    return piGoalStateSchema.parse(data)
  }
  return null
}
