import { ConversationTextParts } from "@/components/conversation-text-parts"
import { ToolCallCard } from "@/components/tool-call-card"
import type { ToolResultView } from "@/lib/message-content"
import type { TranscriptPart } from "@/lib/session-types"

const EMPTY_TOOL_RESULTS = new Map<string, ToolResultView>()

export function ConversationMessageParts({
  parts,
  literal = false,
  thinkingActive = false,
  toolResults = EMPTY_TOOL_RESULTS,
}: {
  parts: TranscriptPart[]
  literal?: boolean
  thinkingActive?: boolean
  toolResults?: ReadonlyMap<string, ToolResultView>
}) {
  return parts.map((part, index) =>
    part.type === "toolCall" ? (
      <ToolCallCard
        key={part.id}
        part={part}
        persistedResult={toolResults.get(part.id)}
      />
    ) : (
      <ConversationTextParts
        key={index}
        parts={[part]}
        literal={literal}
        thinkingActive={thinkingActive}
      />
    )
  )
}
