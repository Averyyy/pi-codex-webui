import type { TranscriptPart } from "@/lib/session-types"

// Both persisted Pi messages and live message_end events carry stopReason.
// Text alone does not establish a final answer (it can be commentary).
export interface ConversationItem {
  id: string | number
  role?: string
  parts?: TranscriptPart[]
  metadata?: Record<string, unknown>
  stopReason?: string
  phase?: string
  errorMessage?: string
  complete?: boolean
}

export type ConversationOutcome =
  "pending" | "complete" | "failed" | "stopped" | "incomplete"

function stopReason(item: ConversationItem) {
  return item.metadata?.stopReason ?? item.stopReason
}

export function conversationOutcome(
  item?: ConversationItem
): ConversationOutcome {
  if (!item || item.complete === false) return "pending"
  switch (stopReason(item)) {
    case "stop":
      return "complete"
    case "error":
      return "failed"
    case "aborted":
      return "stopped"
    case "length":
      return "incomplete"
    default:
      return "pending"
  }
}

function isResponsePart(part: TranscriptPart) {
  return part.type !== "thinking" && part.type !== "toolCall"
}

export function isFinalAssistantMessage(item: ConversationItem) {
  if (item.role !== "assistant") return false
  if (item.parts?.some((part) => part.type === "toolCall")) return false
  const phase = item.metadata?.phase ?? item.phase
  if (phase === "commentary") return false
  const hasOutput = item.parts?.some(
    (part) =>
      isResponsePart(part) &&
      (part.type !== "text" || part.text.trim().length > 0)
  )
  if (!hasOutput && !item.errorMessage && stopReason(item) !== "aborted")
    return false
  return phase === "final_answer" || conversationOutcome(item) !== "pending"
}

export function conversationRounds<T extends ConversationItem>(
  items: readonly T[]
) {
  const rounds: T[][] = []
  for (const item of items) {
    if (!rounds.length || item.role === "user") rounds.push([])
    rounds[rounds.length - 1]!.push(item)
  }
  return rounds
}

export function partitionConversationRound<T extends ConversationItem>(
  items: readonly T[]
) {
  const userIndex = items.findIndex((item) => item.role === "user")
  const leading = userIndex >= 0 ? items.slice(0, userIndex + 1) : []
  const content = items.slice(userIndex + 1)
  let lastAssistantIndex = -1
  for (let index = content.length - 1; index >= 0; index -= 1) {
    if (content[index]?.role === "assistant") {
      lastAssistantIndex = index
      break
    }
  }
  const lastAssistant = content[lastAssistantIndex]
  const outcome = conversationOutcome(lastAssistant)
  const hasResponse =
    lastAssistant !== undefined && isFinalAssistantMessage(lastAssistant)
  if (!hasResponse) {
    return {
      leading,
      process: content,
      response: undefined,
      trailing: [] as T[],
      outcome,
    }
  }
  const process = content.slice(0, lastAssistantIndex)
  const processParts =
    lastAssistant.parts?.filter((part) => !isResponsePart(part)) ?? []
  if (processParts.length)
    process.push({ ...lastAssistant, parts: processParts })
  return {
    leading,
    process,
    response: {
      ...lastAssistant,
      parts: lastAssistant.parts?.filter(isResponsePart) ?? [],
    },
    trailing: content.slice(lastAssistantIndex + 1),
    outcome,
  }
}

export function canCollapseConversation(
  hasResponse: boolean,
  outcome: ConversationOutcome
) {
  return hasResponse && outcome !== "stopped"
}
