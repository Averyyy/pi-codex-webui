export interface ConversationItem {
  sessionPath: string
  name: string
  updatedAt: string
}

export interface ConversationState {
  currentSessionPath: string
  conversations: ConversationItem[]
}

export interface ConversationResult {
  sessionPath?: string
}

export function isConversationState(
  value: unknown
): value is ConversationState {
  return (
    typeof value === "object" &&
    value !== null &&
    "currentSessionPath" in value &&
    typeof value.currentSessionPath === "string" &&
    "conversations" in value &&
    Array.isArray(value.conversations) &&
    value.conversations.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "sessionPath" in item &&
        typeof item.sessionPath === "string" &&
        "name" in item &&
        typeof item.name === "string" &&
        "updatedAt" in item &&
        typeof item.updatedAt === "string"
    )
  )
}
