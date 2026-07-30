import {
  defineWorkerExtension,
  type WorkerAdapterContext,
} from "@pi-web-codex/extension-sdk"

import {
  parseWorkflowControlInput,
  parseWorkflowDialogResult,
  parseWorkflowRuns,
  toolFeedback,
  type WorkflowState,
} from "./contract.js"

async function listRuns(context: WorkerAdapterContext) {
  return parseWorkflowRuns(
    await context.invokeTargetTool("workflow_control", { action: "list" })
  )
}

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "dynamic-workflows.open",
    probe: (target) =>
      target.commands.has("workflows") && target.tools.has("workflow_control")
        ? { compatible: true }
        : {
            compatible: false,
            reason: "Missing workflows command or workflow_control tool.",
          },
    async handle(request, context) {
      const args = request.args.trim()
      if (args && args !== "ui") return { handled: false }
      const result = parseWorkflowDialogResult(
        await context.openView({
          viewId: "dynamic-workflows.manager",
          placement: "session.dialog",
          blocking: true,
          title: "Dynamic workflows",
          state: { runs: await listRuns(context) } satisfies WorkflowState,
        })
      )
      return result.commandArgs
        ? { handled: false, args: result.commandArgs }
        : { handled: true }
    },
  })

  web.registerAction({
    id: "dynamic-workflows.control",
    async handle(request, context) {
      const input = parseWorkflowControlInput(request.input)
      const feedback =
        input.action === "refresh"
          ? {}
          : toolFeedback(
              await context.invokeTargetTool("workflow_control", {
                action: input.action,
                runId: input.runId,
              })
            )
      const state = {
        runs: await listRuns(context),
        ...feedback,
      } satisfies WorkflowState
      context.updateView(request.instanceId, state)
      return state
    },
  })
})
