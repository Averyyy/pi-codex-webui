import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import {
  RESOURCE_CATEGORIES,
  parseResourceCenterResult,
} from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "resource-center.open",
    probe: (target) =>
      target.commands.has("resource")
        ? { compatible: true }
        : { compatible: false, reason: "Missing resource command." },
    async handle(request, context) {
      if (request.args.trim()) return { handled: false }
      const result = parseResourceCenterResult(
        await context.openView({
          viewId: "resource-center.browser",
          placement: "session.dialog",
          blocking: true,
          title: "Resource Center",
          state: { categories: RESOURCE_CATEGORIES },
        })
      )
      return "commandArgs" in result
        ? { handled: false, args: result.commandArgs }
        : { handled: true }
    },
  })
})
