import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"
import { extractScheduledPromptState } from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerRendererAdapter({
    id: "scheduled-prompt.render",
    probe: (target) =>
      target.messageRenderers.has("scheduled_prompt")
        ? { compatible: true }
        : { compatible: false, reason: "Missing scheduled_prompt renderer." },
    render(request) {
      const state = extractScheduledPromptState(request.payload)
      if (!state) return undefined
      return {
        viewId: "scheduled-prompt.view",
        placement: "conversation.after",
        state,
      }
    },
  })
})
