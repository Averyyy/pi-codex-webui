import "server-only"

import { createHash, randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import type { DatabaseSync } from "node:sqlite"

import { getPiSessionsRoot } from "@/lib/app-paths"
import { getDatabase, inTransaction } from "@/lib/database"
import {
  parsePiSession,
  parsePiSessionEntries,
  projectName,
  readStablePiSessionFile,
  searchableText,
  summarizePiEntries,
  type PiSessionEntry,
} from "@/lib/pi-session"

declare global {
  var piWebCodexIndexSync: Promise<void> | undefined
}

interface IndexedSessionRow {
  id: string
  project_id: string
  native_session_id: string
  title: string | null
  first_message: string
  message_count: number
  updated_at: string
  file_mtime_ns: string
  indexed_size: number
  indexed_lines: number
  ends_with_newline: number
  content_hash: string
  last_entry_id: string | null
}

const decoder = new TextDecoder("utf-8", { fatal: true })

function hash(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex")
}

async function discoverSessionFiles(root: string) {
  let rootEntries: Dirent[]
  try {
    rootEntries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const files: string[] = []
  async function visit(directory: string, entries = rootEntries) {
    for (const entry of entries) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(target, await readdir(target, { withFileTypes: true }))
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(target)
      }
    }
  }

  await visit(root)
  return files.sort()
}

function indexedSession(database: DatabaseSync, file: string) {
  return database
    .prepare(
      `SELECT id, project_id, native_session_id, title, first_message,
              message_count, updated_at, file_mtime_ns, indexed_size,
              indexed_lines, ends_with_newline, content_hash, last_entry_id
       FROM sessions
       WHERE native_session_file = ?`
    )
    .get(file) as unknown as IndexedSessionRow | undefined
}

function insertEntries(
  database: DatabaseSync,
  sessionId: string,
  entries: PiSessionEntry[]
) {
  const entryStatement = database.prepare(
    `INSERT INTO session_entries(
       session_id, entry_id, parent_id, entry_type, timestamp
     ) VALUES (?, ?, ?, ?, ?)`
  )
  const searchStatement = database.prepare(
    `INSERT INTO session_search(
       session_id, entry_id, entry_type, timestamp, text
     ) VALUES (?, ?, ?, ?, ?)`
  )

  for (const entry of entries) {
    entryStatement.run(
      sessionId,
      entry.id,
      entry.parentId,
      entry.type,
      entry.timestamp
    )
    const text = searchableText(entry).trim()
    if (text) {
      searchStatement.run(
        sessionId,
        entry.id,
        entry.type,
        entry.timestamp,
        text
      )
    }
  }
}

function ensureProject(
  database: DatabaseSync,
  canonicalPath: string,
  createdAt: string,
  updatedAt: string
) {
  const existing = database
    .prepare("SELECT id FROM projects WHERE canonical_path = ?")
    .get(canonicalPath) as { id: string } | undefined
  const id = existing?.id ?? randomUUID()

  database
    .prepare(
      `INSERT INTO projects(
         id, canonical_path, display_name, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(canonical_path) DO UPDATE SET
         display_name = excluded.display_name,
         created_at = min(projects.created_at, excluded.created_at),
         updated_at = max(projects.updated_at, excluded.updated_at)`
    )
    .run(id, canonicalPath, projectName(canonicalPath), createdAt, updatedAt)
  return id
}

function replaceSession(
  database: DatabaseSync,
  file: string,
  content: Buffer,
  mtimeNs: string,
  existing: IndexedSessionRow | undefined
) {
  const parsed = parsePiSession(file, decoder.decode(content))
  const canonicalPath = parsed.header.cwd ? path.resolve(parsed.header.cwd) : ""
  const sameNativeSession =
    !existing || existing.native_session_id === parsed.header.id
  const sessionId = existing && sameNativeSession ? existing.id : randomUUID()
  const endsWithNewline = content.at(-1) === 0x0a ? 1 : 0

  inTransaction(database, () => {
    if (existing && !sameNativeSession) {
      database
        .prepare("DELETE FROM session_search WHERE session_id = ?")
        .run(existing.id)
      database.prepare("DELETE FROM sessions WHERE id = ?").run(existing.id)
    }

    const projectId = ensureProject(
      database,
      canonicalPath,
      parsed.header.timestamp,
      parsed.updatedAt
    )
    database
      .prepare(
        `INSERT INTO sessions(
           id, project_id, runtime_kind, runtime_profile_id,
           native_session_id, native_session_file, parent_session_file,
           title, created_at, updated_at, message_count, first_message,
           file_mtime_ns, indexed_size, indexed_lines, ends_with_newline,
           content_hash, last_entry_id
         ) VALUES (?, ?, 'pi', 'pi', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(native_session_file) DO UPDATE SET
           project_id = excluded.project_id,
           native_session_id = excluded.native_session_id,
           parent_session_file = excluded.parent_session_file,
           title = excluded.title,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           message_count = excluded.message_count,
           first_message = excluded.first_message,
           file_mtime_ns = excluded.file_mtime_ns,
           indexed_size = excluded.indexed_size,
           indexed_lines = excluded.indexed_lines,
           ends_with_newline = excluded.ends_with_newline,
           content_hash = excluded.content_hash,
           last_entry_id = excluded.last_entry_id`
      )
      .run(
        sessionId,
        projectId,
        parsed.header.id,
        file,
        parsed.header.parentSession ?? null,
        parsed.title ?? null,
        parsed.header.timestamp,
        parsed.updatedAt,
        parsed.messageCount,
        parsed.firstMessage,
        mtimeNs,
        content.length,
        parsed.entries.length + 1,
        endsWithNewline,
        hash(content),
        parsed.entries.at(-1)?.id ?? null
      )

    database
      .prepare("DELETE FROM session_search WHERE session_id = ?")
      .run(sessionId)
    database
      .prepare("DELETE FROM session_entries WHERE session_id = ?")
      .run(sessionId)
    insertEntries(database, sessionId, parsed.entries)
  })
}

function appendSession(
  database: DatabaseSync,
  file: string,
  content: Buffer,
  mtimeNs: string,
  existing: IndexedSessionRow
) {
  const appended = decoder.decode(content.subarray(existing.indexed_size))
  const entries = parsePiSessionEntries(
    file,
    appended,
    existing.indexed_lines + 1
  )
  const metadata = summarizePiEntries(entries, {
    title: existing.title ?? undefined,
    firstMessage: existing.first_message,
    messageCount: existing.message_count,
    updatedAt: existing.updated_at,
  })

  inTransaction(database, () => {
    insertEntries(database, existing.id, entries)
    database
      .prepare(
        `UPDATE sessions SET
           title = ?, updated_at = ?, message_count = ?, first_message = ?,
           file_mtime_ns = ?, indexed_size = ?, indexed_lines = ?,
           ends_with_newline = ?, content_hash = ?, last_entry_id = ?
         WHERE id = ?`
      )
      .run(
        metadata.title ?? null,
        metadata.updatedAt,
        metadata.messageCount,
        metadata.firstMessage,
        mtimeNs,
        content.length,
        existing.indexed_lines + entries.length,
        content.at(-1) === 0x0a ? 1 : 0,
        hash(content),
        entries.at(-1)?.id ?? existing.last_entry_id,
        existing.id
      )
  })
}

async function indexSessionFile(database: DatabaseSync, file: string) {
  const existing = indexedSession(database, file)
  const fileStats = await stat(file, { bigint: true })
  const mtimeNs = fileStats.mtimeNs.toString()
  if (
    existing &&
    existing.file_mtime_ns === mtimeNs &&
    existing.indexed_size === Number(fileStats.size)
  ) {
    return
  }

  const stable = await readStablePiSessionFile(file)
  const { content } = stable
  if (
    existing &&
    existing.ends_with_newline === 1 &&
    content.length >= existing.indexed_size &&
    hash(content.subarray(0, existing.indexed_size)) === existing.content_hash
  ) {
    if (content.length === existing.indexed_size) {
      database
        .prepare("UPDATE sessions SET file_mtime_ns = ? WHERE id = ?")
        .run(stable.mtimeNs, existing.id)
    } else {
      appendSession(database, file, content, stable.mtimeNs, existing)
    }
    return
  }

  replaceSession(database, file, content, stable.mtimeNs, existing)
}

function removeMissingSessions(database: DatabaseSync, files: Set<string>) {
  const indexed = database
    .prepare("SELECT id, native_session_file FROM sessions")
    .all() as { id: string; native_session_file: string }[]

  inTransaction(database, () => {
    for (const session of indexed) {
      if (files.has(session.native_session_file)) continue
      database
        .prepare("DELETE FROM session_search WHERE session_id = ?")
        .run(session.id)
      database.prepare("DELETE FROM sessions WHERE id = ?").run(session.id)
    }
    database.exec(`
      DELETE FROM projects
      WHERE NOT EXISTS (
        SELECT 1 FROM sessions WHERE sessions.project_id = projects.id
      );

      UPDATE projects SET
        created_at = (
          SELECT min(created_at) FROM sessions
          WHERE sessions.project_id = projects.id
        ),
        updated_at = (
          SELECT max(updated_at) FROM sessions
          WHERE sessions.project_id = projects.id
        );
    `)
  })
}

async function performSync() {
  const [database, files] = await Promise.all([
    getDatabase(),
    discoverSessionFiles(getPiSessionsRoot()),
  ])
  for (const file of files) {
    await indexSessionFile(database, file)
  }
  removeMissingSessions(database, new Set(files))
}

export function syncPiSessionIndex() {
  if (globalThis.piWebCodexIndexSync) return globalThis.piWebCodexIndexSync

  const operation = performSync().then(
    () => {
      if (globalThis.piWebCodexIndexSync === operation) {
        globalThis.piWebCodexIndexSync = undefined
      }
    },
    (error) => {
      if (globalThis.piWebCodexIndexSync === operation) {
        globalThis.piWebCodexIndexSync = undefined
      }
      throw error
    }
  )
  globalThis.piWebCodexIndexSync = operation
  return operation
}

export async function syncPiSessionFile(file: string) {
  await syncPiSessionIndex()
  const root = path.resolve(getPiSessionsRoot())
  const target = path.resolve(file)
  const [realRoot, realTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ])
  const relative = path.relative(realRoot, realTarget)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Pi session file is outside the session root: ${target}`)
  }
  const indexedFile = path.join(root, relative)
  await indexSessionFile(await getDatabase(), indexedFile)
  return indexedFile
}
