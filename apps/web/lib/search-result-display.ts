const searchEntryTypeLabels: Record<string, string> = {
  session_title: "标题",
  message: "消息",
  tool: "工具",
  tool_call: "工具",
  tool_result: "工具",
  model_change: "模型变更",
  thinking_level_change: "推理强度变更",
  compaction: "上下文压缩",
  branch_summary: "分支摘要",
  custom_message: "扩展消息",
  custom: "目标",
}

const unanchoredEntryTypes = new Set([
  "session_title",
  "custom",
  "label",
  "session_info",
])

export function searchEntryTypeLabel(entryType: string) {
  return searchEntryTypeLabels[entryType] ?? "记录"
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
