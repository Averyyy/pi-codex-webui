import type { SessionSummary } from "@/lib/session-types"
import { stripAnsi } from "@/lib/ansi"

const SESSION_TITLE_MAX_LENGTH = 120

export function displaySessionTitle(
  session: Pick<SessionSummary, "title" | "firstMessage" | "projectId">
) {
  const title =
    formatInlinePreview(session.title ?? "") ||
    formatInlinePreview(session.firstMessage)
  if (!title) return session.projectId === null ? "新任务" : "未命名会话"

  const characters = Array.from(title)
  if (characters.length <= SESSION_TITLE_MAX_LENGTH) return title
  return `${characters
    .slice(0, SESSION_TITLE_MAX_LENGTH - 1)
    .join("")
    .trimEnd()}…`
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
