import {
  createTranslator,
  DEFAULT_LOCALE,
  type MessageKey,
  type Translator,
} from "@/lib/i18n"

const searchEntryTypeLabelKeys: Record<string, MessageKey> = {
  session_title: "search.entry.title",
  message: "search.entry.message",
  tool: "search.entry.tool",
  tool_call: "search.entry.tool",
  tool_result: "search.entry.tool",
  model_change: "search.entry.modelChange",
  thinking_level_change: "search.entry.thinkingChange",
  compaction: "search.entry.compaction",
  branch_summary: "search.entry.branchSummary",
  custom_message: "search.entry.customMessage",
  custom: "search.entry.goal",
}

const defaultTranslator = createTranslator(DEFAULT_LOCALE)

const unanchoredEntryTypes = new Set([
  "session_title",
  "custom",
  "label",
  "session_info",
])

export function searchEntryTypeLabel(
  entryType: string,
  t: Translator = defaultTranslator
) {
  return t(searchEntryTypeLabelKeys[entryType] ?? "search.entry.record")
}

export function searchResultHref(
  sessionHref: string,
  result: { entryId: string | null; entryType: string }
) {
  if (!result.entryId || unanchoredEntryTypes.has(result.entryType)) {
    return sessionHref
  }
  return `${sessionHref}#${encodeURIComponent(`entry-${result.entryId}`)}`
}
