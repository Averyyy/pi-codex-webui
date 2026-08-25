import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"
import { extractNotifyState } from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerRendererAdapter({
    id: "notify.render",
    probe: (target) =>
      target.commands.has("notify")
        ? { compatible: true }
        : { compatible: false, reason: "Missing notify command." },
    render(request) {
      if (request.payload?.customType !== "notify") return undefined
      const state = extractNotifyState(request.payload.details)
      if (!state) return undefined
      return {
        viewId: "notify.view",
        placement: "message.replace",
        state,
      }
    },
  })
})
