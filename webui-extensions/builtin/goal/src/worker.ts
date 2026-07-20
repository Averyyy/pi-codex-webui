import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import {
  goalViewState,
  isGoalActionInput,
  type GoalActionInput,
} from "./contract.js"

function commandArgs(input: GoalActionInput) {
  if (input.command !== "edit") return input.command
  const budget = input.tokenBudget ? ` --tokens ${input.tokenBudget}` : ""
  return `edit${budget} ${input.objective.trim()}`
}

export default defineWorkerExtension((web) => {
  web.registerRendererAdapter({
    id: "goal.status",
    probe: (target) =>
      target.commands.has("goal")
        ? { compatible: true }
        : { compatible: false, reason: "Missing goal command." },
    render(request, context) {
      const statusText =
        typeof request.payload === "object" &&
        request.payload !== null &&
        "statusText" in request.payload
          ? request.payload.statusText
          : undefined
      const state = goalViewState(
        context.session.latestCustomEntry?.("goal-state"),
        statusText
      )
      return state
        ? {
            viewId: "goal.card",
            placement: "composer.above",
            state,
          }
        : undefined
    },
  })

  web.registerAction({
    id: "goal.command",
    async handle(request, context) {
      if (!isGoalActionInput(request.input)) {
        throw new TypeError("Goal adapter received an invalid command.")
      }
      if (!context.session.command) {
        throw new Error("Goal adapter host cannot invoke Pi commands.")
      }
      await context.session.command("goal", commandArgs(request.input))
      return { accepted: true }
    },
  })
})
