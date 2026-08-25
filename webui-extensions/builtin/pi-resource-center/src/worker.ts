import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"
import { extractResourceCenterState } from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerRendererAdapter({
    id: "resource-center.render",
    probe: (target) =>
      target.commands.has("resource_center")
        ? { compatible: true }
        : { compatible: false, reason: "Missing resource_center command." },
    render(request) {
      if (request.payload?.customType !== "resource_center") return undefined
      const state = extractResourceCenterState(request.payload.details)
      if (!state) return undefined
      return {
        viewId: "resource-center.view",
        placement: "message.replace",
        state,
      }
    },
  })
})
