import type { SessionEntry } from "@earendil-works/pi-coding-agent"

import type { WebUiAdapterHost } from "./webui-adapter-host.js"

interface RpcCustomMessage {
  role: "custom"
  customType: string
  content: unknown
  display: boolean
  details?: unknown
  timestamp: number
}

type MessageRendererHost = Pick<WebUiAdapterHost, "tryRenderMessage">

function isRpcCustomMessage(message: unknown): message is RpcCustomMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    message.role === "custom" &&
    "customType" in message &&
    typeof message.customType === "string" &&
    "display" in message &&
    typeof message.display === "boolean" &&
    "timestamp" in message &&
    typeof message.timestamp === "number"
  )
}

function customEntries(entries: readonly SessionEntry[]) {
  return entries.filter(
    (entry): entry is Extract<SessionEntry, { type: "custom_message" }> =>
      entry.type === "custom_message" && entry.display
  )
}

function restoredMessage(
  entry: Extract<SessionEntry, { type: "custom_message" }>
): RpcCustomMessage {
  return {
    role: "custom",
    customType: entry.customType,
    content: entry.content,
    display: entry.display,
    details: entry.details,
    timestamp: Date.parse(entry.timestamp),
  }
}

export class RpcCustomMessageRenderer {
  private readonly renderedEntryIds = new Set<string>()

  constructor(private readonly host: MessageRendererHost) {}

  restore(entries: readonly SessionEntry[]) {
    for (const entry of customEntries(entries)) {
      if (this.renderedEntryIds.has(entry.id)) continue
      this.renderedEntryIds.add(entry.id)
      const message = restoredMessage(entry)
      this.host.tryRenderMessage(entry.customType, message, {
        entryId: entry.id,
        customType: entry.customType,
        messageTimestamp: message.timestamp,
      })
    }
  }

  renderCompleted(message: unknown, entries: readonly SessionEntry[]) {
    if (!isRpcCustomMessage(message) || !message.display) return
    const candidates = customEntries(entries)
    let entry: (typeof candidates)[number] | undefined
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index]
      if (
        candidate?.customType === message.customType &&
        !this.renderedEntryIds.has(candidate.id)
      ) {
        entry = candidate
        break
      }
    }
    if (!entry) return
    this.renderedEntryIds.add(entry.id)
    this.host.tryRenderMessage(message.customType, message, {
      entryId: entry.id,
      customType: message.customType,
      messageTimestamp: message.timestamp,
    })
  }
}
