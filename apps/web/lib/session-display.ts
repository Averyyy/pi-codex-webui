import type { SessionSummary } from "@/lib/session-types"
import { stripAnsi } from "@/lib/ansi"

const SESSION_TITLE_MAX_LENGTH = 120

export function displaySessionTitle(
  session: Pick<SessionSummary, "title" | "firstMessage" | "projectId">,
  fallback: { task: string; conversation: string } = {
    task: "新任务",
    conversation: "未命名会话",
  }
) {
  const title =
    formatInlinePreview(session.title ?? "") ||
    formatInlinePreview(session.firstMessage)
  if (!title) {
    return session.projectId === null ? fallback.task : fallback.conversation
  }

  const characters = Array.from(title)
  if (characters.length <= SESSION_TITLE_MAX_LENGTH) return title
  return `${characters
    .slice(0, SESSION_TITLE_MAX_LENGTH - 1)
    .join("")
    .trimEnd()}…`
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

export function formatTimestamp(value: string, locale = "zh-CN") {
  let formatter = dateFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    })
    dateFormatters.set(locale, formatter)
  }
  return formatter.format(new Date(value))
}

export function formatInlinePreview(value: string) {
  return stripAnsi(value).replace(/\s+/g, " ").trim()
}
