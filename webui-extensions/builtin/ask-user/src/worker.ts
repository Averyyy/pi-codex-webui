import {
  defineWorkerExtension,
  type WorkerAdapterContext,
} from "@pi-web-codex/extension-sdk"

import {
  ASK_USER_ANSWERED_EVENT,
  ASK_USER_BLOCKED_EVENT,
  ASK_USER_CANCELLED_EVENT,
  ASK_USER_TOOL,
  askUserAnsweredEventPayload,
  askUserBatchEventPayload,
  askUserCancelledEventPayload,
  buildBatchToolResult,
  buildToolResult,
  isAskBatchRequest,
  parseAskBatchParams,
  parseAskDialogResult,
  parseAskParams,
  type AskBatchAnswer,
  type AskBatchParams,
  type AskParams,
} from "./contract.js"

const DIALOG_TITLE = "需要你的选择"

function invalidParamsResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    handled: true as const,
    result: {
      content: [
        {
          type: "text",
          text: message.startsWith("Malformed options:")
            ? `All provided options were malformed, so nothing could be shown to the user. Each option must be a plain string or an object like { "title": "Short label", "description": "Optional detail" }. Call ask_user again with corrected options.`
            : message,
        },
      ],
      isError: true,
      details: { error: message },
    },
  }
}

async function whileBlocked<T>(
  context: WorkerAdapterContext,
  run: () => Promise<T>
) {
  context.emitTargetEvent(ASK_USER_BLOCKED_EVENT, {
    active: true,
    label: "Waiting for user response",
  })
  try {
    return await run()
  } finally {
    context.emitTargetEvent(ASK_USER_BLOCKED_EVENT, { active: false })
  }
}

async function askBatch(
  context: WorkerAdapterContext,
  batch: AskBatchParams
): Promise<AskBatchAnswer[] | null> {
  const deadline =
    batch.timeout !== undefined ? Date.now() + batch.timeout : undefined
  const answers: AskBatchAnswer[] = []
  for (const [index, entry] of batch.questions.entries()) {
    let state: AskParams = entry
    if (deadline !== undefined) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) return null
      state = { ...entry, timeout: remaining }
    }
    const rawResult = await context.openView({
      viewId: "ask-user.dialog",
      placement: "session.dialog",
      blocking: true,
      title: `${DIALOG_TITLE}（${index + 1}/${batch.questions.length}）`,
      state,
    })
    const result = parseAskDialogResult(rawResult, entry)
    if (result.cancelled || !result.response) return null
    answers.push({ status: "answered", response: result.response })
  }
  return answers
}

function emitBatchEvents(
  context: WorkerAdapterContext,
  batch: AskBatchParams,
  answers: AskBatchAnswer[] | null
) {
  const total = batch.questions.length
  batch.questions.forEach((entry, index) => {
    const answer = answers?.[index]
    if (!answers) {
      context.emitTargetEvent(
        ASK_USER_CANCELLED_EVENT,
        askUserBatchEventPayload(askUserCancelledEventPayload(entry), {
          index,
          total,
        })
      )
    } else if (answer?.status === "answered") {
      context.emitTargetEvent(
        ASK_USER_ANSWERED_EVENT,
        askUserBatchEventPayload(
          askUserAnsweredEventPayload(entry, answer.response),
          { index, total }
        )
      )
    }
  })
}

export default defineWorkerExtension((web) => {
  web.registerToolExecutionAdapter({
    id: "ask-user.execute",
    probe: (target) =>
      target.tools.has(ASK_USER_TOOL)
        ? { compatible: true }
        : { compatible: false, reason: "Missing ask_user tool." },
    async execute(request, context) {
      if (isAskBatchRequest(request.params)) {
        let batch
        try {
          batch = parseAskBatchParams(request.params)
        } catch (error) {
          return invalidParamsResult(error)
        }
        const answers = await whileBlocked(context, async () => {
          const answers = await askBatch(context, batch)
          emitBatchEvents(context, batch, answers)
          return answers
        })
        return { handled: true, result: buildBatchToolResult(batch, answers) }
      }

      let params
      try {
        params = parseAskParams(request.params)
      } catch (error) {
        return invalidParamsResult(error)
      }

      return whileBlocked(context, async () => {
        const rawResult = await context.openView({
          viewId: "ask-user.dialog",
          placement: "session.dialog",
          blocking: true,
          title: DIALOG_TITLE,
          state: params,
        })
        const result = parseAskDialogResult(rawResult, params)
        context.emitTargetEvent(
          result.cancelled ? ASK_USER_CANCELLED_EVENT : ASK_USER_ANSWERED_EVENT,
          result.cancelled
            ? askUserCancelledEventPayload(params)
            : askUserAnsweredEventPayload(params, result.response!)
        )
        return {
          handled: true as const,
          result: buildToolResult(params, result),
        }
      })
    },
  })
})
