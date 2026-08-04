import { ConversationTextParts } from "@/components/conversation-text-parts"
import { ToolCallCard } from "@/components/tool-call-card"
import type { ToolResultView } from "@/lib/message-content"
import type { TranscriptPart } from "@/lib/session-types"
import type { Locale } from "@/lib/i18n"

const EMPTY_TOOL_RESULTS = new Map<string, ToolResultView>()

export function ConversationMessageParts({
  parts,
  literal = false,
  thinkingActive = false,
  toolResults = EMPTY_TOOL_RESULTS,
  locale,
}: {
  parts: TranscriptPart[]
  literal?: boolean
  thinkingActive?: boolean
  toolResults?: ReadonlyMap<string, ToolResultView>
  locale: Locale
}) {
  return parts.map((part, index) =>
    part.type === "toolCall" ? (
      <ToolCallCard
        key={part.id}
        part={part}
        persistedResult={toolResults.get(part.id)}
        locale={locale}
      />
    ) : (
      <ConversationTextParts
        key={index}
        parts={[part]}
        literal={literal}
        thinkingActive={thinkingActive}
        locale={locale}
      />
    )
  )
}
