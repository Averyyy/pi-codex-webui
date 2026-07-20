import type { TranscriptPart } from "@/lib/session-types"

export interface ToolResultView {
  parts: TranscriptPart[]
  details?: unknown
  isError?: boolean
}

export function normalizeTranscriptParts(content: unknown): TranscriptPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }]
  if (!Array.isArray(content)) {
    return [{ type: "unsupported", partType: typeof content, value: content }]
  }

  return content.map((part): TranscriptPart => {
    if (typeof part !== "object" || part === null || !("type" in part)) {
      return { type: "unsupported", partType: typeof part, value: part }
    }
    if (
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      return { type: "text", text: part.text }
    }
    if (
      part.type === "thinking" &&
      "thinking" in part &&
      typeof part.thinking === "string"
    ) {
      return {
        type: "thinking",
        text: part.thinking,
        redacted: "redacted" in part && part.redacted === true,
      }
    }
    if (
      part.type === "image" &&
      "data" in part &&
      typeof part.data === "string" &&
      "mimeType" in part &&
      typeof part.mimeType === "string"
    ) {
      return { type: "image", data: part.data, mimeType: part.mimeType }
    }
    if (
      part.type === "toolCall" &&
      "id" in part &&
      typeof part.id === "string" &&
      "name" in part &&
      typeof part.name === "string" &&
      "arguments" in part &&
      typeof part.arguments === "object" &&
      part.arguments !== null &&
      !Array.isArray(part.arguments)
    ) {
      return {
        type: "toolCall",
        id: part.id,
        name: part.name,
        arguments: part.arguments as Record<string, unknown>,
      }
    }
    return { type: "unsupported", partType: String(part.type), value: part }
  })
}

export function normalizeToolResult(
  value: unknown,
  isError?: boolean
): ToolResultView {
  if (typeof value !== "object" || value === null || !("content" in value)) {
    throw new Error("Runtime emitted an invalid tool result.")
  }
  return {
    parts: normalizeTranscriptParts(value.content),
    ...(isError === undefined ? {} : { isError }),
    ...("details" in value ? { details: value.details } : {}),
  }
}
