import {
  defineWorkerExtension,
  type WorkerAdapterContext,
} from "@pi-web-codex/extension-sdk"

import {
  parseIntercomActionInput,
  toolFailed,
  toolText,
  type IntercomState,
} from "./contract.js"

async function listPeers(context: WorkerAdapterContext) {
  const result = await context.invokeTargetTool("intercom", { action: "list" })
  const text = toolText(result)
  return {
    peers: text || "No intercom sessions returned.",
    ...(toolFailed(result) ? { error: text || "Intercom list failed." } : {}),
  }
}

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "intercom.open",
    probe: (target) =>
      target.commands.has("intercom") && target.tools.has("intercom")
        ? { compatible: true }
        : {
            compatible: false,
            reason: "Missing intercom command or tool.",
          },
    async handle(request, context) {
      const initial = await listPeers(context)
      await context.openView({
        viewId: "intercom.dialog",
        placement: "session.dialog",
        blocking: true,
        title: "Intercom",
        state: {
          ...initial,
          ...(request.args.trim() ? { draft: request.args.trim() } : {}),
        } satisfies IntercomState,
      })
      return { handled: true }
    },
  })

  web.registerAction({
    id: "intercom.execute",
    async handle(request, context) {
      const input = parseIntercomActionInput(request.input)
      const params: Record<string, string> = { action: input.action }
      for (const key of [
        "to",
        "message",
        "replyTo",
        "messageId",
        "cwd",
      ] as const) {
        if (input[key]) params[key] = input[key]
      }
      const result = await context.invokeTargetTool("intercom", params)
      const output = toolText(result)
      const refreshed: IntercomState =
        input.action === "list" ? { peers: output } : await listPeers(context)
      const state: IntercomState = {
        ...refreshed,
        ...(toolFailed(result)
          ? { error: output || "Intercom action failed." }
          : refreshed.error
            ? {}
            : { output }),
      }
      context.updateView(request.instanceId, state)
      return state
    },
  })
})
