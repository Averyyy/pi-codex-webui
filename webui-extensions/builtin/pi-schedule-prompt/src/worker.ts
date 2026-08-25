import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"
import { extractScheduledPromptState } from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerRendererAdapter({
    id: "scheduled-prompt.render",
    probe: (target) =>
      target.commands.has("schedule_prompt")
        ? { compatible: true }
        : { compatible: false, reason: "Missing schedule_prompt command." },
    render(request) {
      if (request.payload?.customType !== "scheduled_prompt") return undefined
      const state = extractScheduledPromptState(request.payload.details)
      if (!state) return undefined
      return {
        viewId: "scheduled-prompt.view",
        placement: "message.replace",
        state,
      }
    },
  })
})
