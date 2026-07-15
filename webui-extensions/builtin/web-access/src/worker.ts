import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import {
  WEB_ACCESS_WORKFLOWS,
  parseWebSearchResult,
  parseWorkflowResult,
} from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "web-access.open-search",
    probe: (target) =>
      target.commands.has("websearch")
        ? { compatible: true }
        : { compatible: false, reason: "Missing websearch command." },
    async handle(request, context) {
      if (request.args.trim()) return { handled: false }
      const result = parseWebSearchResult(
        await context.openView({
          viewId: "web-access.search",
          placement: "session.dialog",
          blocking: true,
          title: "Web search",
          state: { queries: [] },
        })
      )
      return "queries" in result
        ? { handled: false, args: result.queries.join(",") }
        : { handled: true }
    },
  })

  web.registerCommandAdapter({
    id: "web-access.configure-curator",
    probe: (target) =>
      target.commands.has("curator")
        ? { compatible: true }
        : { compatible: false, reason: "Missing curator command." },
    async handle(request, context) {
      if (request.args.trim()) return { handled: false }
      const result = parseWorkflowResult(
        await context.openView({
          viewId: "web-access.workflow",
          placement: "session.dialog",
          blocking: true,
          title: "Search workflow",
          state: { workflows: WEB_ACCESS_WORKFLOWS },
        })
      )
      return "workflow" in result
        ? { handled: false, args: result.workflow }
        : { handled: true }
    },
  })
})
