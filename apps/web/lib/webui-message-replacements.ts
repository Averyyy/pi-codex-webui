import type { WebUiViewSnapshot } from "@workspace/runtime-protocol"

export function replacesTranscriptEntry(
  views: readonly WebUiViewSnapshot[],
  entryId: string
) {
  return views.some((view) => view.replacesEntry?.entryId === entryId)
}

export function replacesStreamingMessage(
  views: readonly WebUiViewSnapshot[],
  message: { customType?: string; timestamp?: number }
) {
  if (message.customType === undefined || message.timestamp === undefined) {
    return false
  }
  return views.some((view) => {
    const replacement = view.replacesEntry
    if (!replacement) return false
    return (
      replacement.customType === message.customType &&
      replacement.messageTimestamp === message.timestamp
    )
  })
}
