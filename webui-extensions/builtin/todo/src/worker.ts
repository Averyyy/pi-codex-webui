import {
  defineWorkerExtension,
  type WorkerAdapterContext,
} from "@pi-web-codex/extension-sdk"

import { parseTodoToolResult } from "./contract.js"

async function loadState(context: WorkerAdapterContext) {
  return parseTodoToolResult(
    await context.invokeTargetTool("todo", { action: "list" })
  )
}

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "rpiv-todo.open",
    probe: (target) =>
      target.commands.has("todos") && target.tools.has("todo")
        ? { compatible: true }
        : { compatible: false, reason: "Missing todos command or todo tool." },
    async handle(request, context) {
      if (request.args.trim()) return { handled: false }
      await context.openView({
        viewId: "rpiv-todo.panel",
        placement: "session.rightPanel",
        blocking: true,
        title: "Todos",
        state: await loadState(context),
      })
      return { handled: true }
    },
  })

  web.registerAction({
    id: "rpiv-todo.refresh",
    async handle(request, context) {
      const state = await loadState(context)
      context.updateView(request.instanceId, state)
      return state
    },
  })
})
