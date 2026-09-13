import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { open, type FileHandle } from "node:fs/promises"
import type { DatabaseSync } from "node:sqlite"
import { isPiGoalControlMessage } from "./pi-goal"
import {
  parsePiSessionEntries,
  parsePiSessionHeader,
  searchableText,
  summarizePiEntries,
  type PiSessionHeader,
} from "./pi-session"

export interface PreviousSessionIndex {
  id: string
  cwd: string
  native_session_id: string
  parent_session_file: string | null
  created_at: string
  title: string | null
  first_message: string
  message_count: number
  updated_at: string
  indexed_size: number
  indexed_lines: number
  ends_with_newline: number
  content_hash: string
  last_entry_id: string | null
  entry_count: number
  offset_count: number
}

async function* lines(
  handle: FileHandle,
  start: number,
  size: number,
  hash: ReturnType<typeof createHash>
) {
  let position = start
  let lineOffset = start
  let fragments: Buffer[] = []
  while (position < size) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, size - position))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
    if (!bytesRead) throw new Error("Session was truncated during indexing.")
    const chunk = buffer.subarray(0, bytesRead)
    hash.update(chunk)
    position += bytesRead
    let offset = 0
    for (;;) {
      const newline = chunk.indexOf(0x0a, offset)
      if (newline === -1) break
      const part = chunk.subarray(offset, newline + 1)
      const content = fragments.length
        ? Buffer.concat([...fragments, part])
        : part
      yield { content, offset: lineOffset }
      lineOffset += content.length
      fragments = []
      offset = newline + 1
    }
    if (offset < chunk.length) fragments.push(chunk.subarray(offset))
  }
  if (fragments.length)
    yield { content: Buffer.concat(fragments), offset: lineOffset }
}

export async function scanSessionIndex(
  database: DatabaseSync,
  file: string,
  previous: PreviousSessionIndex | undefined
) {
  const handle = await open(file, "r")
  const table = `session_index_${randomUUID().replaceAll("-", "")}`
  database.exec(`CREATE TEMP TABLE ${table} (
    entry_id TEXT PRIMARY KEY, parent_id TEXT, entry_type TEXT, timestamp TEXT,
    byte_offset INTEGER, byte_length INTEGER, line_number INTEGER,
    message_role TEXT, custom_type TEXT, search_text TEXT
  )`)
  const dispose = () => database.exec(`DROP TABLE IF EXISTS ${table}`)
  try {
    const snapshot = await handle.stat({ bigint: true })
    const size = Number(snapshot.size)
    let hash = createHash("sha256")
    let append = false
    if (
      previous &&
      previous.ends_with_newline === 1 &&
      previous.indexed_size <= size &&
      previous.entry_count === previous.indexed_lines - 1 &&
      previous.offset_count === previous.entry_count
    ) {
      let offset = 0
      const buffer = Buffer.allocUnsafe(64 * 1024)
      while (offset < previous.indexed_size) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(buffer.length, previous.indexed_size - offset),
          offset
        )
        if (!bytesRead)
          throw new Error("Session was truncated during indexing.")
        hash.update(buffer.subarray(0, bytesRead))
        offset += bytesRead
      }
      append = hash.copy().digest("hex") === previous.content_hash
      if (!append) hash = createHash("sha256")
    }
    let header: PiSessionHeader | undefined =
      append && previous
        ? {
            type: "session",
            id: previous.native_session_id,
            cwd: previous.cwd,
            timestamp: previous.created_at,
            ...(previous.parent_session_file
              ? { parentSession: previous.parent_session_file }
              : {}),
          }
        : undefined
    let metadata =
      append && previous
        ? {
            title: previous.title ?? undefined,
            firstMessage: previous.first_message,
            messageCount: previous.message_count,
            updatedAt: previous.updated_at,
          }
        : {
            title: undefined as string | undefined,
            firstMessage: "",
            messageCount: 0,
            updatedAt: "",
          }
    let lineNumber = append && previous ? previous.indexed_lines + 1 : 1
    let entryCount = 0
    let lastEntryId = append && previous ? previous.last_entry_id : null
    let endsWithNewline = append ? 1 : 0
    const insert = database.prepare(
      `INSERT INTO ${table} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const decoder = new TextDecoder("utf-8", { fatal: true })
    for await (const line of lines(
      handle,
      append && previous ? previous.indexed_size : 0,
      size,
      hash
    )) {
      endsWithNewline = line.content.at(-1) === 0x0a ? 1 : 0
      const text = decoder.decode(line.content)
      if (!header) {
        header = parsePiSessionHeader(file, text)
        metadata.updatedAt = header.timestamp
      } else {
        const entries = parsePiSessionEntries(file, text, lineNumber)
        if (entries.length !== 1)
          throw new Error("A JSONL record must occupy one line.")
        const entry = entries[0]!
        const message = entry.message as { role?: unknown } | undefined
        const role =
          message &&
          typeof message.role === "string" &&
          !isPiGoalControlMessage(message)
            ? message.role
            : null
        insert.run(
          entry.id,
          entry.parentId,
          entry.type,
          entry.timestamp,
          line.offset,
          line.content.length,
          lineNumber,
          role,
          typeof entry.customType === "string" ? entry.customType : null,
          searchableText(entry).trim()
        )
        metadata = summarizePiEntries(entries, metadata)
        metadata.firstMessage = metadata.firstMessage.slice(0, 512)
        const lastCodeUnit = metadata.firstMessage.charCodeAt(metadata.firstMessage.length - 1)
        if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) metadata.firstMessage = metadata.firstMessage.slice(0, -1)
        lastEntryId = entry.id
        entryCount++
      }
      lineNumber++
    }
    if (!header) throw new Error(`Session file is empty: ${file}`)
    const parents = new Map<string, string | null>()
    if (append && previous) {
      for (const row of database
        .prepare(
          "SELECT entry_id, parent_id FROM session_entries WHERE session_id = ?"
        )
        .all(previous.id)) {
        parents.set(row.entry_id as string, row.parent_id as string | null)
      }
    }
    for (const row of database
      .prepare(`SELECT entry_id, parent_id FROM ${table}`)
      .all()) {
      if (parents.has(row.entry_id as string))
        throw new Error(`Session contains duplicate entry id ${row.entry_id}.`)
      parents.set(row.entry_id as string, row.parent_id as string | null)
    }
    for (const parent of parents.values()) {
      if (parent !== null && !parents.has(parent))
        throw new Error(`Session entry references missing parent ${parent}.`)
    }
    const complete = new Set<string>()
    for (const start of parents.keys()) {
      const visited = new Set<string>()
      let id: string | null = start
      while (id !== null && !complete.has(id)) {
        if (visited.has(id)) throw new Error(`Session tree contains a cycle at entry ${id}.`)
        visited.add(id)
        const parent = parents.get(id)
        if (parent === undefined) throw new Error(`Session entry references missing parent ${id}.`)
        id = parent
      }
      for (const visitedId of visited) complete.add(visitedId)
    }
    return {
      header,
      ...metadata,
      append,
      size,
      entryCount,
      lastEntryId,
      endsWithNewline,
      indexedLines: lineNumber - 1,
      mtimeNs: snapshot.mtimeNs.toString(),
      contentHash: hash.digest("hex"),
      insertInto(sessionId: string) {
        database
          .prepare(
            `INSERT INTO session_entries(session_id, entry_id, parent_id, entry_type, timestamp,
          byte_offset, byte_length, line_number, message_role, custom_type)
          SELECT ?, entry_id, parent_id, entry_type, timestamp, byte_offset, byte_length,
                 line_number, message_role, custom_type FROM ${table} ORDER BY byte_offset`
          )
          .run(sessionId)
        database
          .prepare(
            `INSERT INTO session_search(session_id, entry_id, entry_type, timestamp, text)
          SELECT ?, entry_id, entry_type, timestamp, search_text FROM ${table} WHERE search_text <> '' ORDER BY byte_offset`
          )
          .run(sessionId)
      },
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  } finally {
    await handle.close()
  }
}

export type ScannedSessionIndex = Awaited<ReturnType<typeof scanSessionIndex>>
