import type { SessionSummary } from "@/lib/session-types"
import { stripAnsi } from "@/lib/ansi"

export function displaySessionTitle(session: SessionSummary) {
  return (
    session.title ||
    session.firstMessage ||
    (session.projectId === null ? "新任务" : "未命名会话")
  )
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatTimestamp(value: string) {
  return dateFormatter.format(new Date(value))
}

export function formatInlinePreview(value: string) {
  return stripAnsi(value).replace(/\s+/g, " ").trim()
}
