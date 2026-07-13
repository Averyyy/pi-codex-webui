import type { SessionSummary } from "@/lib/session-types"

export function displaySessionTitle(session: SessionSummary) {
  return session.title || session.firstMessage || session.nativeSessionId
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
})

export function formatTimestamp(value: string) {
  return dateFormatter.format(new Date(value))
}
