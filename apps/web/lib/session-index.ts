import "server-only"

import { randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import { open, readdir, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import process from "node:process"
import type { DatabaseSync } from "node:sqlite"

import { getPiSessionsRoot } from "@/lib/app-paths"
import { getDatabase, inTransaction } from "@/lib/database"
import { parsePiSessionHeader } from "@/lib/pi-session"
import {
  scanSessionIndex,
  type ScannedSessionIndex,
} from "@/lib/session-index-scan"

declare global {
  var piWebCodexIndexSync: Promise<void> | undefined
}

interface IndexedSessionRow {
  id: string
  project_id: string | null
  cwd: string
  created_at: string
  parent_session_file: string | null
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
  entry_count: number
  offset_count: number
}

const sessionTitleSearchEntryType = "session_title"
const sessionIndexLocks = new Map<string, Promise<void>>()

function isPiSessionFileName(name: string) {
  return name.endsWith(".jsonl") && !name.includes(".jsonl.")
}

function logSkippedSessionFile(file: string, error: unknown) {
  console.error(`Skipping session file ${file}:`, error)
}

async function readDirectoryEntries(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function discoverSessionFiles(root: string) {
  const files: string[] = []
  async function visit(directory: string) {
    const entries = await readDirectoryEntries(directory)
    for (const entry of entries) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(target)
      } else if (entry.isFile() && isPiSessionFileName(entry.name)) {
        files.push(target)
      }
    }
  }

  await visit(root)
  return files.sort()
}

async function discoverProjectSessionCandidates(root: string) {
  const files: string[] = []

  async function visit(directory: string) {
    let entries: Dirent[]
    try {
      entries = await readDirectoryEntries(directory)
    } catch (error) {
      logSkippedSessionFile(directory, error)
      return
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        // Pi accepts custom session directories and cwd aliases. A directory
        // name cannot rule out a session; the canonical header cwd decides.
        await visit(target)
      } else if (entry.isFile() && isPiSessionFileName(entry.name)) {
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
      `SELECT sessions.id, project_id, cwd, created_at, parent_session_file, native_session_id, title,
              first_message, message_count, updated_at, file_mtime_ns,
              indexed_size, indexed_lines, ends_with_newline, content_hash,
              last_entry_id,
              (SELECT count(*) FROM session_entries
               WHERE session_id = sessions.id) AS entry_count,
              (SELECT count(byte_offset) FROM session_entries
               WHERE session_id = sessions.id) AS offset_count
       FROM sessions
       WHERE native_session_file = ?`
    )
    .get(file) as unknown as IndexedSessionRow | undefined
}

function replaceSessionTitleSearch(
  database: DatabaseSync,
  sessionId: string,
  title: string | null | undefined,
  timestamp: string
) {
  database
    .prepare(
      `DELETE FROM session_search
       WHERE session_id = ? AND entry_id = '' AND entry_type = ?`
    )
    .run(sessionId, sessionTitleSearchEntryType)

  const text = title?.trim()
  if (!text) return

  database
    .prepare(
      `INSERT INTO session_search(
         session_id, entry_id, entry_type, timestamp, text
       ) VALUES (?, '', ?, ?, ?)`
    )
    .run(sessionId, sessionTitleSearchEntryType, timestamp, text)
}

function registeredProjectId(database: DatabaseSync, canonicalPath: string) {
  return (
    database
      .prepare(
        `SELECT projects.id FROM project_registrations
         JOIN projects ON projects.id = project_registrations.project_id
         WHERE projects.canonical_path = ?`
      )
      .get(canonicalPath) as { id: string } | undefined
  )?.id
}

async function canonicalizeCwd(cwd: string) {
  const resolved = path.resolve(cwd)
  try {
    return await realpath(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return resolved
    throw error
  }
}

function isWithinDirectory(directory: string, candidate: string) {
  const normalizedDirectory = path.resolve(
    process.platform === "win32" ? directory.toLowerCase() : directory
  )
  const normalizedCandidate = path.resolve(
    process.platform === "win32" ? candidate.toLowerCase() : candidate
  )
  const relative = path.relative(normalizedDirectory, normalizedCandidate)
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

async function sessionFileCwd(file: string) {
  return canonicalizeCwd((await sessionFileHeader(file)).cwd)
}

async function sessionFileHeader(file: string) {
  const handle = await open(file, "r")
  try {
    for await (const line of handle.readLines()) {
      return parsePiSessionHeader(file, line)
    }
  } finally {
    await handle.close()
  }
  throw new Error(`Session file is empty: ${file}`)
}

async function replaceSession(
  database: DatabaseSync,
  file: string,
  parsed: ScannedSessionIndex,
  existing: IndexedSessionRow | undefined
) {
  const canonicalPath = await canonicalizeCwd(parsed.header.cwd)
  const sameNativeSession =
    !existing || existing.native_session_id === parsed.header.id
  const sessionId = existing && sameNativeSession ? existing.id : randomUUID()

  inTransaction(database, () => {
    if (existing && !sameNativeSession) {
      database
        .prepare("DELETE FROM session_search WHERE session_id = ?")
        .run(existing.id)
      database.prepare("DELETE FROM sessions WHERE id = ?").run(existing.id)
    }

    const projectId =
      existing && sameNativeSession
        ? existing.project_id
        : (registeredProjectId(database, canonicalPath) ?? null)
    database
      .prepare(
        `INSERT INTO sessions(
           id, project_id, cwd, runtime_kind, runtime_profile_id,
           native_session_id, native_session_file, parent_session_file,
           title, created_at, updated_at, message_count, first_message,
           file_mtime_ns, indexed_size, indexed_lines, ends_with_newline,
           content_hash, last_entry_id
         ) VALUES (?, ?, ?, 'pi', 'pi', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(native_session_file) DO UPDATE SET
           project_id = excluded.project_id,
           cwd = excluded.cwd,
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
           index_generation = sessions.index_generation + 1,
           last_entry_id = excluded.last_entry_id`
      )
      .run(
        sessionId,
        projectId,
        canonicalPath,
        parsed.header.id,
        file,
        parsed.header.parentSession ?? null,
        parsed.title ?? null,
        parsed.header.timestamp,
        parsed.updatedAt,
        parsed.messageCount,
        parsed.firstMessage,
        parsed.mtimeNs,
        parsed.size,
        parsed.indexedLines,
        parsed.endsWithNewline,
        parsed.contentHash,
        parsed.lastEntryId
      )

    database
      .prepare("DELETE FROM session_search WHERE session_id = ?")
      .run(sessionId)
    database
      .prepare("DELETE FROM session_entries WHERE session_id = ?")
      .run(sessionId)
    replaceSessionTitleSearch(
      database,
      sessionId,
      parsed.title,
      parsed.updatedAt
    )
    parsed.insertInto(sessionId)
  })
}

function appendSession(
  database: DatabaseSync,
  parsed: ScannedSessionIndex,
  existing: IndexedSessionRow
) {
  const metadata = parsed
  inTransaction(database, () => {
    parsed.insertInto(existing.id)
    replaceSessionTitleSearch(
      database,
      existing.id,
      metadata.title,
      metadata.updatedAt
    )
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
        parsed.mtimeNs,
        parsed.size,
        parsed.indexedLines,
        parsed.endsWithNewline,
        parsed.contentHash,
        parsed.lastEntryId,
        existing.id
      )
  })
}

async function indexSessionFileNow(database: DatabaseSync, file: string) {
  const existing = indexedSession(database, file)
  const fileStats = await stat(file, { bigint: true })
  const mtimeNs = fileStats.mtimeNs.toString()
  if (
    existing &&
    existing.file_mtime_ns === mtimeNs &&
    existing.indexed_size === Number(fileStats.size) &&
    existing.offset_count === existing.entry_count &&
    existing.entry_count === existing.indexed_lines - 1
  ) {
    return
  }

  const parsed = await scanSessionIndex(database, file, existing)
  try {
    if (parsed.append && existing) {
      if (parsed.entryCount === 0)
        database
          .prepare("UPDATE sessions SET file_mtime_ns = ? WHERE id = ?")
          .run(parsed.mtimeNs, existing.id)
      else appendSession(database, parsed, existing)
    } else await replaceSession(database, file, parsed, existing)
  } finally {
    parsed.dispose()
  }
}

function indexSessionFile(database: DatabaseSync, file: string) {
  const previous = sessionIndexLocks.get(file) ?? Promise.resolve()
  const operation = previous.then(() => indexSessionFileNow(database, file))
  const settled = operation.then(
    () => {
      if (sessionIndexLocks.get(file) === settled) {
        sessionIndexLocks.delete(file)
      }
    },
    () => {
      if (sessionIndexLocks.get(file) === settled) {
        sessionIndexLocks.delete(file)
      }
    }
  )
  sessionIndexLocks.set(file, settled)
  return operation
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
      UPDATE projects SET
        created_at = coalesce((
          SELECT min(created_at) FROM sessions
          WHERE sessions.project_id = projects.id
        ), created_at),
        updated_at = coalesce((
          SELECT max(updated_at) FROM sessions
          WHERE sessions.project_id = projects.id
        ), updated_at);
    `)
  })
}

async function performSync() {
  const [database, files, homeDirectory] = await Promise.all([
    getDatabase(),
    discoverSessionFiles(getPiSessionsRoot()),
    canonicalizeCwd(homedir()),
  ])
  const registeredProjects = database
    .prepare(
      `SELECT project_registrations.project_id, projects.canonical_path
       FROM project_registrations
       JOIN projects ON projects.id = project_registrations.project_id`
    )
    .all() as { project_id: string; canonical_path: string }[]
  const registeredProjectIds = new Set(
    registeredProjects.map(({ project_id }) => project_id)
  )
  const registeredPaths = new Set(
    registeredProjects.map(({ canonical_path }) => canonical_path)
  )
  const taskPaths = new Set(
    (
      database
        .prepare(
          `SELECT DISTINCT cwd FROM sessions
           WHERE project_id IS NULL AND archived_at IS NULL`
        )
        .all() as { cwd: string }[]
    ).map(({ cwd }) => cwd)
  )
  for (const file of files) {
    try {
      const existing = indexedSession(database, file)
      if (existing) {
        if (
          existing.project_id === null ||
          registeredProjectIds.has(existing.project_id)
        ) {
          await indexSessionFile(database, file)
        }
        continue
      }
      const header = await sessionFileHeader(file)
      const cwd = await canonicalizeCwd(header.cwd)
      if (
        !isWithinDirectory(homeDirectory, cwd) &&
        !registeredPaths.has(cwd) &&
        !taskPaths.has(cwd)
      ) {
        continue
      }
      await indexSessionFile(database, file)
    } catch (error) {
      logSkippedSessionFile(file, error)
    }
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

export async function syncPiProjectSessions(projectId: string) {
  const database = await getDatabase()
  const project = database
    .prepare(
      `SELECT projects.canonical_path FROM project_registrations
       JOIN projects ON projects.id = project_registrations.project_id
       WHERE projects.id = ?`
    )
    .get(projectId) as { canonical_path: string } | undefined
  if (!project) throw new Error(`Project not found: ${projectId}`)

  const files = await discoverProjectSessionCandidates(getPiSessionsRoot())
  for (const file of files) {
    try {
      const cwd = await sessionFileCwd(file)
      if (cwd !== project.canonical_path) continue
      await indexSessionFile(database, file)
    } catch (error) {
      logSkippedSessionFile(file, error)
    }
  }
}

export async function resolvePiSessionFile(file: string) {
  const root = path.resolve(getPiSessionsRoot())
  const target = path.resolve(file)
  if (!isPiSessionFileName(path.basename(target))) {
    throw new Error(`Not a Pi session file: ${target}`)
  }
  const [realRoot, realTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ])
  const relative = path.relative(realRoot, realTarget)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Pi session file is outside the session root: ${target}`)
  }
  const indexedFile = path.join(root, relative)
  return indexedFile
}

export async function syncPiSessionFile(file: string) {
  const indexedFile = await resolvePiSessionFile(file)
  await indexSessionFile(await getDatabase(), indexedFile)
  return indexedFile
}
