import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import {
  CODEX_QUICK_ACTIONS,
  parseCodexQuickSettingsResult,
} from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "codex.quick-settings",
    probe: (target) =>
      target.commands.has("codex")
        ? { compatible: true }
        : { compatible: false, reason: "Missing codex command." },
    async handle(request, context) {
      if (request.args.trim()) return { handled: false }
      const result = parseCodexQuickSettingsResult(
        await context.openView({
          viewId: "codex.quick-settings",
          placement: "session.dialog",
          blocking: true,
          title: "Codex quick settings",
          state: { actions: CODEX_QUICK_ACTIONS },
        })
      )
      return "command" in result
        ? { handled: false, args: result.command }
        : { handled: true }
    },
  })
})
