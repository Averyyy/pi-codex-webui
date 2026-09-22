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

export interface ConversationActivityFragment<T extends ConversationItem> {
  /** The source item, with the fragment's original metadata preserved. */
  item: T
  /** The contiguous part range represented by this fragment. */
  parts: TranscriptPart[]
  /** Stable within the source item, for rendering split entries safely. */
  key: string
  /** Whether this fragment reaches the source item's final part. */
  isSourceTail: boolean
}

export type ConversationActivityBlock<T extends ConversationItem> =
  | {
      type: "activity"
      fragments: ConversationActivityFragment<T>[]
    }
  | {
      type: "commentary"
      fragments: ConversationActivityFragment<T>[]
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

function isActivityPart(part: TranscriptPart) {
  return part.type === "thinking" || part.type === "toolCall"
}

/**
 * Split a process into explicit activity and commentary blocks.
 *
 * Thinking and tool calls are activity. All other parts remain commentary,
 * even when they share an assistant message with a tool call. This keeps the
 * visible prose between activity groups instead of hiding it in a collapsed
 * disclosure. Bash execution entries are command activity as a whole.
 */
export function conversationActivityBlocks<T extends ConversationItem>(
  items: readonly T[]
): ConversationActivityBlock<T>[] {
  const blocks: ConversationActivityBlock<T>[] = []

  for (const item of items) {
    const parts = item.parts ?? []
    if (parts.length === 0) {
      blocks.push({
        type: "commentary",
        fragments: [
          { item, parts: [], key: `${String(item.id)}:0`, isSourceTail: true },
        ],
      })
      continue
    }

    let start = 0
    let fragmentIndex = 0
    const forceActivity = item.role === "bashExecution"
    const append = (end: number) => {
      if (end <= start) return
      const fragmentParts = parts.slice(start, end)
      const type =
        forceActivity || fragmentParts.some(isActivityPart)
          ? ("activity" as const)
          : ("commentary" as const)
      const fragment: ConversationActivityFragment<T> = {
        item,
        parts: fragmentParts,
        key: `${String(item.id)}:${fragmentIndex}`,
        isSourceTail: end === parts.length,
      }
      fragmentIndex += 1
      const last = blocks.at(-1)
      if (type === "activity" && last?.type === "activity") {
        last.fragments.push(fragment)
      } else {
        blocks.push({ type, fragments: [fragment] })
      }
      start = end
    }

    if (forceActivity) {
      append(parts.length)
      continue
    }

    let activity = isActivityPart(parts[0]!)
    for (let index = 1; index < parts.length; index += 1) {
      const nextActivity = isActivityPart(parts[index]!)
      if (nextActivity !== activity) {
        append(index)
        activity = nextActivity
      }
    }
    append(parts.length)
  }

  return blocks
}

/**
 * Keep one canonical anchor per source item when part ranges are split for
 * activity rendering. A process fragment derived from the final assistant
 * item is deliberately suffixed so the final answer owns the canonical id.
 */
export function conversationActivityDisplayId<T extends ConversationItem>(
  fragment: ConversationActivityFragment<T>,
  finalId: string | number | undefined,
  suffix: string
) {
  const id = String(fragment.item.id)
  if (finalId !== undefined && id === String(finalId)) return `${id}:process`
  return fragment.key === `${id}:0` ? id : `${fragment.key}:${suffix}`
}

export function conversationActivityCommandCount<T extends ConversationItem>(
  block: Extract<ConversationActivityBlock<T>, { type: "activity" }>
) {
  return block.fragments.reduce(
    (count, fragment) =>
      count +
      (fragment.item.role === "bashExecution" ? 1 : 0) +
      fragment.parts.filter((part) => part.type === "toolCall").length,
    0
  )
}

/**
 * Identify the one activity block that should advertise live work. A stale
 * incomplete source item is not enough: it must still be streaming its tail
 * fragment, or contain a tool call whose explicit live id is active.
 */
export function conversationActivityBlockIsRunning<T extends ConversationItem>(
  block: Extract<ConversationActivityBlock<T>, { type: "activity" }>,
  activeToolIds: ReadonlySet<string>,
  runtimeActive: boolean
) {
  if (!runtimeActive) return false
  if (
    block.fragments.some((fragment) =>
      fragment.parts.some(
        (part) => part.type === "toolCall" && activeToolIds.has(part.id)
      )
    )
  )
    return true
  if (activeToolIds.size > 0) return false
  const tail = block.fragments.at(-1)
  return tail?.isSourceTail === true && tail.item.complete === false
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
  outcome: ConversationOutcome,
  active = false
) {
  return (
    !active && hasResponse && outcome !== "stopped" && outcome !== "pending"
  )
}
