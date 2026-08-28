import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import {
  ASK_USER_ANSWERED_EVENT,
  ASK_USER_BLOCKED_EVENT,
  ASK_USER_CANCELLED_EVENT,
  ASK_USER_TOOL,
  buildToolResult,
  parseAskDialogResult,
  parseAskParams,
} from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerToolExecutionAdapter({
    id: "ask-user.execute",
    probe: (target) =>
      target.tools.has(ASK_USER_TOOL)
        ? { compatible: true }
        : { compatible: false, reason: "Missing ask_user tool." },
    async execute(request, context) {
      let params
      try {
        params = parseAskParams(request.params)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          handled: true,
          result: {
            content: [
              {
                type: "text",
                text: message.startsWith("Malformed options:")
                  ? `All provided options were malformed, so nothing could be shown to the user. Each option must be a plain string or an object like { "title": "Short label", "description": "Optional detail" }. Call ask_user again with corrected options.`
                  : message,
              },
            ],
            isError: true,
            details: { error: message },
          },
        }
      }

      context.emitTargetEvent(ASK_USER_BLOCKED_EVENT, {
        active: true,
        label: "Waiting for user response",
      })
      try {
        const rawResult = await context.openView({
          viewId: "ask-user.dialog",
          placement: "session.dialog",
          blocking: true,
          title: "需要你的选择",
          state: params,
        })
        const result = parseAskDialogResult(rawResult, params)
        context.emitTargetEvent(
          result.cancelled ? ASK_USER_CANCELLED_EVENT : ASK_USER_ANSWERED_EVENT,
          result.cancelled
            ? {
                question: params.question,
                context: params.context,
                options: params.options,
              }
            : {
                question: params.question,
                context: params.context,
                response: result.response,
              }
        )
        return { handled: true, result: buildToolResult(params, result) }
      } finally {
        context.emitTargetEvent(ASK_USER_BLOCKED_EVENT, { active: false })
      }
    },
  })
})
