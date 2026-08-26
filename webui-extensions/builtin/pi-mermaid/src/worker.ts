import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"
import { extractMermaidState } from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerRendererAdapter({
    id: "mermaid.render",
    probe: (target) =>
      target.messageRenderers.has("pi-mermaid")
        ? { compatible: true }
        : { compatible: false, reason: "Missing pi-mermaid renderer." },
    render(request) {
      const state = extractMermaidState(request.payload)
      if (!state) return undefined
      return {
        viewId: "mermaid.diagram",
        placement: "conversation.after",
        state,
      }
    },
  })
})
