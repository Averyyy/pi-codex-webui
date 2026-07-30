import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import {
  ASK_USER_BLOCKED_EVENT,
  ASK_USER_PROMPT_EVENT,
  ASK_USER_QUESTION_TOOL,
  askUserPromptPayload,
  buildQuestionnaireResponse,
  parseAskUserDialogResult,
  parseQuestionParams,
  validateQuestionnaire,
  validationToolResult,
} from "./contract.js"

export default defineWorkerExtension((web) => {
  web.registerToolExecutionAdapter({
    id: "ask-user-question.execute",
    probe: (target) =>
      target.tools.has(ASK_USER_QUESTION_TOOL)
        ? { compatible: true }
        : {
            compatible: false,
            reason: "Missing ask_user_question tool.",
          },
    async execute(request, context) {
      const params = parseQuestionParams(request.params)
      const validation = validateQuestionnaire(params)
      if (!validation.ok) {
        return {
          handled: true,
          result: validationToolResult(validation),
        }
      }

      context.emitTargetEvent(
        ASK_USER_PROMPT_EVENT,
        askUserPromptPayload(params)
      )
      context.emitTargetEvent(ASK_USER_BLOCKED_EVENT, { active: true })
      try {
        const dialogResult = await context.openView({
          viewId: "ask-user-question.dialog",
          placement: "session.dialog",
          blocking: true,
          title: "回答问题",
          state: { questions: params.questions },
        })
        return {
          handled: true,
          result: buildQuestionnaireResponse(
            parseAskUserDialogResult(dialogResult, params),
            params
          ),
        }
      } finally {
        context.emitTargetEvent(ASK_USER_BLOCKED_EVENT, { active: false })
      }
    },
  })
})
