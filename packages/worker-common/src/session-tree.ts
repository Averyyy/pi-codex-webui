import type { SessionManager } from "@earendil-works/pi-coding-agent"

type SessionEntry = ReturnType<SessionManager["getEntries"]>[number]

const maxDisplayTextLength = 200

function contentText(content: unknown) {
  if (typeof content === "string") {
    return content.slice(0, maxDisplayTextLength) || undefined
  }
  if (!Array.isArray(content)) return undefined

  let result = ""
  for (const block of content) {
    if (
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "text" &&
      "text" in block &&
      typeof block.text === "string"
    ) {
      result += block.text
      if (result.length >= maxDisplayTextLength) {
        return result.slice(0, maxDisplayTextLength)
      }
    }
  }
  return result || undefined
}

export function sessionTreeEntryText(entry: SessionEntry) {
  if (entry.type === "message") {
    return "content" in entry.message
      ? contentText(entry.message.content)
      : undefined
  }
  if (entry.type === "custom_message") return contentText(entry.content)
  if (entry.type === "compaction" || entry.type === "branch_summary") {
    return entry.summary.slice(0, maxDisplayTextLength) || undefined
  }
  if (entry.type === "session_info") return entry.name
  return undefined
}
