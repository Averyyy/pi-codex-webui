import "server-only"

import { open } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { normalizeTranscriptParts } from "@/lib/message-content"
import type { TranscriptEntry } from "@/lib/session-types"

const headerSchema = z
  .object({
    type: z.literal("session"),
    version: z.number().int().positive().optional(),
    id: z.string().min(1),
    timestamp: z.iso.datetime(),
    cwd: z.string(),
    parentSession: z.string().optional(),
  })
  .passthrough()

const entrySchema = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
    parentId: z.string().nullable(),
    timestamp: z.iso.datetime(),
  })
  .passthrough()

export type PiSessionHeader = z.infer<typeof headerSchema>
export type PiSessionEntry = z.infer<typeof entrySchema>

export interface ParsedPiSession {
  header: PiSessionHeader
  entries: PiSessionEntry[]
  activeBranch: PiSessionEntry[]
  title?: string
  firstMessage: string
  messageCount: number
  updatedAt: string
}

export interface PiSessionMetadata {
  title?: string
  firstMessage: string
  messageCount: number
  updatedAt: string
}

export class PiSessionFormatError extends Error {
  constructor(file: string, line: number, detail: string) {
    super(`${file}:${line}: ${detail}`)
  }
}

export function parsePiSessionHeader(file: string, line: string) {
  const result = headerSchema.safeParse(parseLine(file, line, 1))
  if (!result.success) {
    throw new PiSessionFormatError(file, 1, z.prettifyError(result.error))
  }
  return result.data
}

export async function readStablePiSessionFile(file: string) {
  const handle = await open(file, "r")
  try {
    const snapshot = await handle.stat({ bigint: true })
    const content = Buffer.alloc(Number(snapshot.size))
    let offset = 0
    while (offset < content.length) {
      const { bytesRead } = await handle.read(
        content,
        offset,
        content.length - offset,
        offset
      )
      if (bytesRead === 0) {
        throw new Error(
          `Session was truncated while it was being read: ${file}`
        )
      }
      offset += bytesRead
    }
    return { content, mtimeNs: snapshot.mtimeNs.toString() }
  } finally {
    await handle.close()
  }
}

function parseLine(file: string, line: string, lineNumber: number) {
  if (line.length === 0) {
    throw new PiSessionFormatError(file, lineNumber, "Unexpected blank line.")
  }

  try {
    return JSON.parse(line) as unknown
  } catch (error) {
    throw new PiSessionFormatError(
      file,
      lineNumber,
      error instanceof Error ? error.message : "Invalid JSON."
    )
  }
}

function parseLines(file: string, content: string) {
  const lines = content.endsWith("\n")
    ? content.slice(0, -1).split(/\r?\n/)
    : content.split(/\r?\n/)
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
    throw new PiSessionFormatError(file, 1, "Session file is empty.")
  }

  const header = parsePiSessionHeader(file, lines[0]!)

  const entries = lines.slice(1).map((line, index) => {
    const lineNumber = index + 2
    const result = entrySchema.safeParse(parseLine(file, line, lineNumber))
    if (!result.success) {
      throw new PiSessionFormatError(
        file,
        lineNumber,
        z.prettifyError(result.error)
      )
    }
    return result.data
  })

  return { header, entries }
}

export function parsePiSessionEntries(
  file: string,
  content: string,
  firstLineNumber: number
) {
  if (!content) return []
  const lines = content.endsWith("\n")
    ? content.slice(0, -1).split(/\r?\n/)
    : content.split(/\r?\n/)
  return lines.map((line, index) => {
    const lineNumber = firstLineNumber + index
    const result = entrySchema.safeParse(parseLine(file, line, lineNumber))
    if (!result.success) {
      throw new PiSessionFormatError(
        file,
        lineNumber,
        z.prettifyError(result.error)
      )
    }
    return result.data
  })
}

function messageValue(entry: PiSessionEntry) {
  if (entry.type !== "message") return null
  const result = z
    .object({ role: z.string().min(1), timestamp: z.number().optional() })
    .passthrough()
    .safeParse(entry.message)
  if (!result.success) {
    throw new Error(
      `Session entry ${entry.id} has an invalid message: ${z.prettifyError(result.error)}`
    )
  }
  return result.data
}

function textFromContent(content: unknown) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
    )
    .map((part) => part.text)
    .join(" ")
}

function activeBranch(entries: PiSessionEntry[]) {
  if (entries.length === 0) return []

  const byId = new Map<string, PiSessionEntry>()
  for (const entry of entries) {
    if (byId.has(entry.id)) {
      throw new Error(`Session contains duplicate entry id ${entry.id}.`)
    }
    byId.set(entry.id, entry)
  }
  const visited = new Set<string>()
  const branch: PiSessionEntry[] = []
  let current: PiSessionEntry | undefined = entries.at(-1)

  while (current) {
    if (visited.has(current.id)) {
      throw new Error(`Session tree contains a cycle at entry ${current.id}.`)
    }
    visited.add(current.id)
    branch.push(current)
    if (current.parentId === null) break
    current = byId.get(current.parentId)
    if (!current) {
      throw new Error(
        `Session entry references missing parent ${branch.at(-1)!.parentId}.`
      )
    }
  }

  return branch.reverse()
}

export function summarizePiEntries(
  entries: PiSessionEntry[],
  baseline: PiSessionMetadata
) {
  let title = baseline.title
  let firstMessage = baseline.firstMessage
  let messageCount = baseline.messageCount
  let lastActivity = Date.parse(baseline.updatedAt)

  for (const entry of entries) {
    if (entry.type === "session_info") {
      title =
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : undefined
    }

    const message = messageValue(entry)
    if (!message) continue
    messageCount += 1
    if (message.role !== "user" && message.role !== "assistant") continue

    if (typeof message.timestamp === "number") {
      lastActivity = Math.max(lastActivity, message.timestamp)
    }
    if (!firstMessage && message.role === "user") {
      firstMessage = textFromContent(message.content)
    }
  }

  return {
    title,
    firstMessage,
    messageCount,
    updatedAt: new Date(lastActivity).toISOString(),
  }
}

export function parsePiSession(file: string, content: string): ParsedPiSession {
  const { header, entries } = parseLines(file, content)
  const metadata = summarizePiEntries(entries, {
    firstMessage: "",
    messageCount: 0,
    updatedAt: header.timestamp,
  })

  return {
    header,
    entries,
    activeBranch: activeBranch(entries),
    ...metadata,
  }
}

function requiredString(value: unknown, context: string) {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`)
  }
  return value
}

function messageEntry(
  entry: PiSessionEntry
): Extract<TranscriptEntry, { kind: "message" }> | null {
  const message = messageValue(entry)
  if (!message) return null

  if (message.role === "custom" && message.display === false) return null
  if (message.role === "bashExecution") {
    const command = requiredString(
      message.command,
      `Session entry ${entry.id} bash command`
    )
    const output = requiredString(
      message.output,
      `Session entry ${entry.id} bash output`
    )
    return {
      kind: "message",
      id: entry.id,
      timestamp: entry.timestamp,
      role: message.role,
      parts: [
        { type: "text", text: command },
        { type: "text", text: output },
      ],
      isError: typeof message.exitCode === "number" && message.exitCode !== 0,
      metadata: message,
    }
  }

  return {
    kind: "message",
    id: entry.id,
    timestamp: entry.timestamp,
    role: message.role,
    parts: normalizeTranscriptParts(message.content),
    isError: message.isError === true,
    toolCallId:
      typeof message.toolCallId === "string" ? message.toolCallId : undefined,
    toolName:
      typeof message.toolName === "string" ? message.toolName : undefined,
    details: message.details,
    metadata: message,
  }
}

function userBranchNavigation(parsed: ParsedPiSession) {
  const children = new Map<string, PiSessionEntry[]>()
  const order = new Map(parsed.entries.map((entry, index) => [entry.id, index]))
  const userSiblings = new Map<string | null, PiSessionEntry[]>()

  for (const entry of parsed.entries) {
    if (entry.parentId !== null) {
      const siblings = children.get(entry.parentId) ?? []
      siblings.push(entry)
      children.set(entry.parentId, siblings)
    }
    const message = messageValue(entry)
    if (message?.role === "user") {
      const siblings = userSiblings.get(entry.parentId) ?? []
      siblings.push(entry)
      userSiblings.set(entry.parentId, siblings)
    }
  }

  const latestLeafById = new Map<string, string>()
  for (let index = parsed.entries.length - 1; index >= 0; index -= 1) {
    const entry = parsed.entries[index]!
    const descendants = children.get(entry.id) ?? []
    let latestLeafId = entry.id
    for (const descendant of descendants) {
      const leafId = latestLeafById.get(descendant.id) ?? descendant.id
      if ((order.get(leafId) ?? -1) > (order.get(latestLeafId) ?? -1)) {
        latestLeafId = leafId
      }
    }
    latestLeafById.set(entry.id, latestLeafId)
  }

  const result = new Map<
    string,
    NonNullable<Extract<TranscriptEntry, { kind: "message" }>["branch"]>
  >()
  for (const entry of parsed.activeBranch) {
    const message = messageValue(entry)
    if (message?.role !== "user") continue
    const siblings = userSiblings.get(entry.parentId) ?? []
    if (siblings.length < 2) continue
    const index = siblings.findIndex((sibling) => sibling.id === entry.id)
    const previous = siblings[index - 1]
    const next = siblings[index + 1]
    const previousEntryId = previous
      ? latestLeafById.get(previous.id)
      : undefined
    const nextEntryId = next ? latestLeafById.get(next.id) : undefined
    result.set(entry.id, {
      index: index + 1,
      total: siblings.length,
      ...(previousEntryId && previousEntryId !== previous?.id
        ? { previousEntryId }
        : {}),
      ...(nextEntryId && nextEntryId !== next?.id ? { nextEntryId } : {}),
    })
  }
  return result
}

export function toTranscriptEntries(parsed: ParsedPiSession) {
  const branchNavigation = userBranchNavigation(parsed)
  return parsed.activeBranch.flatMap((entry): TranscriptEntry[] => {
    const message = messageEntry(entry)
    if (message) {
      const branch = branchNavigation.get(entry.id)
      return [branch ? { ...message, branch } : message]
    }

    if (entry.type === "model_change") {
      const provider = requiredString(
        entry.provider,
        `Session entry ${entry.id} provider`
      )
      const modelId = requiredString(
        entry.modelId,
        `Session entry ${entry.id} modelId`
      )
      return [
        {
          kind: "event",
          id: entry.id,
          timestamp: entry.timestamp,
          eventType: entry.type,
          title: "模型",
          text: `${provider} / ${modelId}`,
        },
      ]
    }
    if (entry.type === "thinking_level_change") {
      const thinkingLevel = requiredString(
        entry.thinkingLevel,
        `Session entry ${entry.id} thinkingLevel`
      )
      return [
        {
          kind: "event",
          id: entry.id,
          timestamp: entry.timestamp,
          eventType: entry.type,
          title: "思考级别",
          text: thinkingLevel,
        },
      ]
    }
    if (entry.type === "compaction" || entry.type === "branch_summary") {
      const summary = requiredString(
        entry.summary,
        `Session entry ${entry.id} summary`
      )
      return [
        {
          kind: "event",
          id: entry.id,
          timestamp: entry.timestamp,
          eventType: entry.type,
          title: entry.type === "compaction" ? "上下文压缩" : "分支摘要",
          text: summary,
        },
      ]
    }
    if (entry.type === "custom_message" && entry.display !== false) {
      const customType = requiredString(
        entry.customType,
        `Session entry ${entry.id} customType`
      )
      return [
        {
          kind: "message",
          id: entry.id,
          timestamp: entry.timestamp,
          role: `custom:${customType}`,
          parts: normalizeTranscriptParts(entry.content),
          details: entry.details,
        },
      ]
    }
    if (["custom", "label", "session_info"].includes(entry.type)) return []

    return [
      {
        kind: "event",
        id: entry.id,
        timestamp: entry.timestamp,
        eventType: entry.type,
        title: `未支持的 entry：${entry.type}`,
        value: entry,
      },
    ]
  })
}

export function searchableText(entry: PiSessionEntry) {
  const message = messageValue(entry)
  if (message) {
    const values = [textFromContent(message.content)]
    if (message.role === "bashExecution") {
      values.push(
        requiredString(
          message.command,
          `Session entry ${entry.id} bash command`
        ),
        requiredString(message.output, `Session entry ${entry.id} bash output`)
      )
    }
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "toolCall"
        ) {
          values.push(JSON.stringify(part))
        }
        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "thinking" &&
          "thinking" in part
        ) {
          values.push(String(part.thinking))
        }
      }
    }
    return values.filter(Boolean).join("\n")
  }

  if (entry.type === "compaction" || entry.type === "branch_summary") {
    return requiredString(entry.summary, `Session entry ${entry.id} summary`)
  }
  if (entry.type === "custom_message") {
    return textFromContent(entry.content)
  }
  return ""
}

export function projectName(cwd: string) {
  if (!cwd) return "未知目录"
  return path.basename(cwd) || cwd
}
