import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

import {
  PROMPT_TEMPLATE_MESSAGE_TYPES,
  PROMPT_TEMPLATE_STATUS_KEYS,
  promptTemplateMessageState,
  promptTemplateStatusState,
  type PromptTemplateMessageType,
  type PromptTemplateStatusKey,
} from "./contract.js"

function registerMessageRenderer(customType: PromptTemplateMessageType) {
  return {
    id: `prompt-template.${customType.replace("prompt-template-", "")}`,
    probe: (target: { messageRenderers: ReadonlySet<string> }) =>
      target.messageRenderers.has(customType)
        ? ({ compatible: true } as const)
        : ({
            compatible: false,
            reason: `Missing ${customType} message renderer.`,
          } as const),
    render(request: { payload: unknown }) {
      const state = promptTemplateMessageState(customType, request.payload)
      return state
        ? {
            viewId: "prompt-template.message",
            placement: "conversation.after" as const,
            state,
          }
        : undefined
    },
  }
}

function registerStatusRenderer(key: PromptTemplateStatusKey) {
  const suffix = key.replace("prompt-", "")
  return {
    id: `prompt-template.status.${suffix}`,
    render(request: { payload: unknown }) {
      const state = promptTemplateStatusState(key, request.payload)
      return state
        ? {
            viewId: "prompt-template.status",
            placement: "composer.above" as const,
            state,
          }
        : undefined
    },
  }
}

export default defineWorkerExtension((web) => {
  for (const customType of PROMPT_TEMPLATE_MESSAGE_TYPES) {
    web.registerRendererAdapter(registerMessageRenderer(customType))
  }
  for (const key of PROMPT_TEMPLATE_STATUS_KEYS) {
    web.registerRendererAdapter(registerStatusRenderer(key))
  }
})
