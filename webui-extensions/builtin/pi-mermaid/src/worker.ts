import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"
import { extractMermaidState } from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerRendererAdapter({
    id: "mermaid.render",
    probe: (target) =>
      target.commands.has("pi-mermaid")
        ? { compatible: true }
        : { compatible: false, reason: "Missing pi-mermaid command." },
    render(request) {
      if (request.payload?.customType !== "pi-mermaid") return undefined
      const state = extractMermaidState(request.payload.details)
      if (!state) return undefined
      return {
        viewId: "mermaid.diagram",
        placement: "message.replace",
        state,
      }
    },
  })
})
