import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import type { ConversationResult, ConversationState } from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "conversation.open",
    probe: (target) =>
      target.commands.has("conversation")
        ? { compatible: true }
        : { compatible: false, reason: "Missing conversation command." },
    async handle(_request, context) {
      const sessionFile = context.session.sessionFile
      if (!sessionFile) return { handled: false }
      const sessions = await context.session.listSessions()
      const state: ConversationState = {
        currentSessionPath: sessionFile,
        conversations: sessions.map((session) => ({
          sessionPath: session.sessionPath,
          name: session.name || session.firstMessage || session.id,
          updatedAt: session.updatedAt,
        })),
      }
      const result = (await context.openView({
        viewId: "conversation.browser",
        placement: "session.overlay",
        blocking: true,
        title: "Conversations",
        state,
      })) as ConversationResult | undefined
      if (result?.sessionPath && result.sessionPath !== sessionFile) {
        const selected = sessions.find(
          (session) => session.sessionPath === result.sessionPath
        )
        if (!selected) {
          throw new Error(
            "Conversation selection is not in the Pi session list."
          )
        }
        await context.session.switchSession(selected.sessionPath)
      }
      return { handled: true }
    },
  })
})
