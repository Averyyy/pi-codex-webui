import "server-only"

import { randomUUID } from "node:crypto"
import { realpath, rm, stat } from "node:fs/promises"
import path from "node:path"

import { getDatabase, inTransaction } from "@/lib/database"
import {
  parsePiSession,
  readStablePiSessionFile,
  toTranscriptEntries,
} from "@/lib/pi-session"
import {
  syncPiProjectSessions,
  syncPiSessionFile,
  syncPiSessionIndex,
} from "@/lib/session-index"
import type {
  ProjectSummary,
  ArchivedSession,
  SessionSearchResult,
  SessionSnapshot,
  SessionSummary,
  WorkspaceProject,
} from "@/lib/session-types"

interface ProjectRow {
  id: string
  canonical_path: string
  display_name: string
  session_count: number
  updated_at: string
  pinned_at: string | null
}

interface SessionRow {
  id: string
  project_id: string | null
  cwd: string
  native_session_id: string
  native_session_file: string
  parent_session_file: string | null
  title: string | null
  created_at: string
  updated_at: string
  message_count: number
  first_message: string
  archived_at: string | null
  pinned_at: string | null
  runtime_kind: "pi" | "pi-client"
  runtime_profile_id: string
  migrated_from_session_id: string | null
}

interface SnapshotRow extends SessionRow {
  project_path: string | null
  project_name: string | null
}

interface ArchivedSessionRow extends SessionRow {
  project_name: string | null
}

interface SearchRow {
  project_id: string | null
  project_name: string | null
  session_id: string
  session_title: string | null
  session_first_message: string
  entry_id: string
  entry_type: string
  timestamp: string
  snippet: string
}

interface RuntimeTargetRow {
  id: string
  project_id: string | null
  cwd: string
  runtime_kind: "pi" | "pi-client"
  runtime_profile_id: string
  native_session_id: string
  native_session_file: string
}

interface SessionIdentityRow {
  id: string
  project_id: string | null
  native_session_id: string
  native_session_file: string
}

interface ProjectRuntimeRow {
  id: string
  canonical_path: string
  default_runtime_profile_id: string | null
}

function projectSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    path: row.canonical_path,
    name: row.display_name,
    sessionCount: row.session_count,
    updatedAt: row.updated_at,
    isPinned: row.pinned_at !== null,
  }
}

function sessionSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    cwd: row.cwd,
    nativeSessionId: row.native_session_id,
    nativeSessionFile: row.native_session_file,
    title: row.title,
    firstMessage: row.first_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
    archivedAt: row.archived_at,
    isPinned: row.pinned_at !== null,
    runtimeKind: row.runtime_kind,
    runtimeProfileId: row.runtime_profile_id,
    migratedFromSessionId: row.migrated_from_session_id,
  }
}

function refreshProject(
  database: Awaited<ReturnType<typeof getDatabase>>,
  projectId: string
) {
  database
    .prepare(
      `UPDATE projects SET
         created_at = coalesce(
           (SELECT min(created_at) FROM sessions WHERE project_id = ?),
           created_at
         ),
         updated_at = coalesce(
           (SELECT max(updated_at) FROM sessions WHERE project_id = ?),
           updated_at
         )
       WHERE id = ?`
    )
    .run(projectId, projectId, projectId)
}

export async function isProjectDirectoryAvailable(canonicalPath: string) {
  try {
    return (await stat(canonicalPath)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function addWorkspaceProject(inputPath: string) {
  const canonicalPath = await realpath(path.resolve(inputPath))
  if (!(await stat(canonicalPath)).isDirectory()) {
    throw new Error("Project path must be a directory.")
  }

  const database = await getDatabase()
  const existing = database
    .prepare("SELECT id FROM projects WHERE canonical_path = ?")
    .get(canonicalPath) as { id: string } | undefined
  const projectId = existing?.id ?? randomUUID()
  if (!existing) {
    const now = new Date().toISOString()
    database
      .prepare(
        `INSERT INTO projects(
           id, canonical_path, display_name, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(projectId, canonicalPath, path.basename(canonicalPath), now, now)
  }

  await syncPiProjectSessions(projectId)
  const project = await getProject(projectId)
  if (!project) throw new Error("Registered project could not be loaded.")
  return project
}

export async function renameWorkspaceProject(projectId: string, name: string) {
  const database = await getDatabase()
  const result = database
    .prepare("UPDATE projects SET display_name = ? WHERE id = ?")
    .run(name, projectId)
  return result.changes === 1
}

export async function setProjectPinned(projectId: string, pinned: boolean) {
  const database = await getDatabase()
  const result = database
    .prepare("UPDATE projects SET pinned_at = ? WHERE id = ?")
    .run(pinned ? new Date().toISOString() : null, projectId)
  return result.changes === 1
}

export async function setSessionPinned(sessionId: string, pinned: boolean) {
  const database = await getDatabase()
  const result = database
    .prepare(
      `UPDATE sessions SET pinned_at = ?
       WHERE id = ? AND archived_at IS NULL`
    )
    .run(pinned ? new Date().toISOString() : null, sessionId)
  return result.changes === 1
}

export async function removeWorkspaceProject(projectId: string) {
  const database = await getDatabase()
  return inTransaction(database, () => {
    const exists = database
      .prepare("SELECT 1 FROM projects WHERE id = ?")
      .get(projectId)
    if (!exists) return false

    database
      .prepare(
        `DELETE FROM session_search WHERE session_id IN (
           SELECT id FROM sessions WHERE project_id = ?
         )`
      )
      .run(projectId)
    database.prepare("DELETE FROM projects WHERE id = ?").run(projectId)
    return true
  })
}

export async function listWorkspaceProjects(): Promise<WorkspaceProject[]> {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const projects = database
    .prepare(
      `SELECT projects.id, canonical_path, display_name,
              count(sessions.id) AS session_count,
              projects.updated_at, projects.pinned_at
       FROM projects
       LEFT JOIN sessions
         ON sessions.project_id = projects.id
        AND sessions.archived_at IS NULL
       GROUP BY projects.id
       ORDER BY projects.pinned_at IS NULL, projects.pinned_at DESC,
                projects.updated_at DESC, display_name COLLATE NOCASE`
    )
    .all() as unknown as ProjectRow[]
  const sessions = database
    .prepare(
      `SELECT id, project_id, cwd, native_session_id, native_session_file,
              parent_session_file, title, created_at, updated_at,
              message_count, first_message, archived_at, pinned_at, runtime_kind,
              runtime_profile_id, migrated_from_session_id
       FROM sessions
       WHERE archived_at IS NULL
       ORDER BY updated_at DESC`
    )
    .all() as unknown as SessionRow[]
  const byProject = new Map<string, SessionRow[]>()
  for (const session of sessions) {
    if (session.project_id === null) continue
    const projectSessions = byProject.get(session.project_id) ?? []
    projectSessions.push(session)
    byProject.set(session.project_id, projectSessions)
  }

  const availableProjects = (
    await Promise.all(
      projects.map(async (project) =>
        (await isProjectDirectoryAvailable(project.canonical_path))
          ? project
          : null
      )
    )
  ).filter((project): project is ProjectRow => project !== null)
  return availableProjects.map((project) => ({
    ...projectSummary(project),
    sessions: (byProject.get(project.id) ?? []).map(sessionSummary),
  }))
}

export async function getProject(projectId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT projects.id, canonical_path, display_name,
              count(sessions.id) AS session_count,
              projects.updated_at, projects.pinned_at
       FROM projects
       LEFT JOIN sessions
         ON sessions.project_id = projects.id
        AND sessions.archived_at IS NULL
       WHERE projects.id = ?
       GROUP BY projects.id`
    )
    .get(projectId) as unknown as ProjectRow | undefined
  return row ? projectSummary(row) : null
}

export async function listProjectSessions(projectId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  return (
    database
      .prepare(
        `SELECT id, project_id, cwd, native_session_id, native_session_file,
                parent_session_file, title, created_at, updated_at,
                message_count, first_message, archived_at, pinned_at, runtime_kind,
                runtime_profile_id, migrated_from_session_id
         FROM sessions
         WHERE project_id = ? AND archived_at IS NULL
         ORDER BY pinned_at IS NULL, pinned_at DESC, updated_at DESC`
      )
      .all(projectId) as unknown as SessionRow[]
  ).map(sessionSummary)
}

export async function listWorkspaceTasks(): Promise<SessionSummary[]> {
  await syncPiSessionIndex()
  const database = await getDatabase()
  return (
    database
      .prepare(
        `SELECT id, project_id, cwd, native_session_id, native_session_file,
                parent_session_file, title, created_at, updated_at,
                message_count, first_message, archived_at, pinned_at, runtime_kind,
                runtime_profile_id, migrated_from_session_id
         FROM sessions
         WHERE project_id IS NULL AND archived_at IS NULL
         ORDER BY pinned_at IS NULL, pinned_at DESC, updated_at DESC`
      )
      .all() as unknown as SessionRow[]
  ).map(sessionSummary)
}

export async function listArchivedSessions(): Promise<ArchivedSession[]> {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const rows = database
    .prepare(
      `SELECT sessions.id, sessions.project_id, sessions.cwd,
              sessions.native_session_id, sessions.native_session_file,
              sessions.parent_session_file, sessions.title,
              sessions.created_at, sessions.updated_at,
              sessions.message_count, sessions.first_message,
              sessions.archived_at, sessions.pinned_at, sessions.runtime_kind,
              sessions.runtime_profile_id, sessions.migrated_from_session_id,
              projects.display_name AS project_name
       FROM sessions
       LEFT JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.archived_at IS NOT NULL
       ORDER BY sessions.archived_at DESC, sessions.updated_at DESC`
    )
    .all() as unknown as ArchivedSessionRow[]
  return rows.map((row) => ({
    ...sessionSummary(row),
    projectName: row.project_name,
  }))
}

export async function archiveSession(sessionId: string) {
  const database = await getDatabase()
  return inTransaction(database, () => {
    const row = database
      .prepare("SELECT archived_at FROM sessions WHERE id = ?")
      .get(sessionId) as { archived_at: string | null } | undefined
    if (!row) return null
    if (row.archived_at) return row.archived_at

    const archivedAt = new Date().toISOString()
    database
      .prepare(
        "UPDATE sessions SET archived_at = ?, pinned_at = NULL WHERE id = ?"
      )
      .run(archivedAt, sessionId)
    return archivedAt
  })
}

export async function deleteArchivedSession(sessionId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT project_id, native_session_file
       FROM sessions
       WHERE id = ? AND archived_at IS NOT NULL`
    )
    .get(sessionId) as
    { project_id: string | null; native_session_file: string } | undefined
  if (!row) return false

  await rm(row.native_session_file, { force: true })
  inTransaction(database, () => {
    database
      .prepare("DELETE FROM session_search WHERE session_id = ?")
      .run(sessionId)
    database
      .prepare("DELETE FROM sessions WHERE id = ? AND archived_at IS NOT NULL")
      .run(sessionId)
    if (row.project_id) refreshProject(database, row.project_id)
  })
  return true
}

export async function getSessionSnapshot(sessionId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT sessions.id, project_id, sessions.cwd, native_session_id,
              native_session_file, parent_session_file, title,
              sessions.created_at, sessions.updated_at, message_count,
              first_message, archived_at, sessions.pinned_at,
              runtime_kind, runtime_profile_id,
              migrated_from_session_id,
              projects.canonical_path AS project_path,
              projects.display_name AS project_name
       FROM sessions
       LEFT JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.id = ? AND sessions.archived_at IS NULL`
    )
    .get(sessionId) as unknown as SnapshotRow | undefined
  if (!row) return null

  const { content } = await readStablePiSessionFile(row.native_session_file)
  const parsed = parsePiSession(
    row.native_session_file,
    new TextDecoder("utf-8", { fatal: true }).decode(content)
  )
  if (parsed.header.id !== row.native_session_id) {
    throw new Error(
      `Session identity changed after indexing: ${row.native_session_file}`
    )
  }

  return {
    session: {
      ...sessionSummary({
        ...row,
        title: parsed.title ?? null,
        first_message: parsed.firstMessage,
        message_count: parsed.messageCount,
        created_at: parsed.header.timestamp,
        updated_at: parsed.updatedAt,
      }),
      projectPath: row.project_path,
      projectName: row.project_name,
      parentSessionFile: parsed.header.parentSession ?? null,
    },
    entries: toTranscriptEntries(parsed),
  } satisfies SessionSnapshot
}

export async function getSessionRuntimeTarget(sessionId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT sessions.id, project_id, sessions.cwd, runtime_kind,
              runtime_profile_id, native_session_id, native_session_file
       FROM sessions
       LEFT JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.id = ? AND sessions.archived_at IS NULL`
    )
    .get(sessionId) as unknown as RuntimeTargetRow | undefined
  if (!row) return null
  return {
    webSessionId: row.id,
    projectId: row.project_id,
    runtimeKind: row.runtime_kind,
    runtimeProfileId: row.runtime_profile_id,
    nativeSessionId: row.native_session_id,
    nativeSessionFile: row.native_session_file,
    cwd: row.cwd,
  }
}

export async function getProjectRuntimeTarget(projectId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT id, canonical_path, default_runtime_profile_id
       FROM projects WHERE id = ?`
    )
    .get(projectId) as unknown as ProjectRuntimeRow | undefined
  return row
    ? {
        projectId: row.id,
        cwd: row.canonical_path,
        defaultRuntimeProfileId: row.default_runtime_profile_id,
      }
    : null
}

export async function bindSessionRuntime(
  sessionId: string,
  runtimeKind: "pi" | "pi-client",
  runtimeProfileId: string,
  migratedFromSessionId: string | null = null
) {
  const database = await getDatabase()
  const result = database
    .prepare(
      `UPDATE sessions
       SET runtime_kind = ?, runtime_profile_id = ?, migrated_from_session_id = ?
       WHERE id = ?`
    )
    .run(runtimeKind, runtimeProfileId, migratedFromSessionId, sessionId)
  if (result.changes !== 1) {
    throw new Error(`Cannot bind missing Web session ${sessionId}.`)
  }
}

export async function markSessionStandalone(
  sessionId: string,
  options: {
    cwd: string
    runtimeKind: "pi" | "pi-client"
    runtimeProfileId: string
    migratedFromSessionId?: string | null
  }
) {
  if (!options.cwd) throw new Error("Standalone session cwd is required.")
  const database = await getDatabase()
  inTransaction(database, () => {
    const session = database
      .prepare("SELECT project_id FROM sessions WHERE id = ?")
      .get(sessionId) as { project_id: string | null } | undefined
    if (!session)
      throw new Error(`Cannot mark missing Web session ${sessionId}.`)

    database
      .prepare(
        `UPDATE sessions SET
           project_id = NULL, cwd = ?, runtime_kind = ?,
           runtime_profile_id = ?, migrated_from_session_id = ?
         WHERE id = ?`
      )
      .run(
        options.cwd,
        options.runtimeKind,
        options.runtimeProfileId,
        options.migratedFromSessionId ?? null,
        sessionId
      )

    if (session.project_id !== null) {
      refreshProject(database, session.project_id)
    }
  })
}

export async function getSessionIdentityByNativeFile(
  nativeSessionFile: string
) {
  const indexedFile = await syncPiSessionFile(nativeSessionFile)
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT id, project_id, native_session_id, native_session_file
       FROM sessions
       WHERE native_session_file = ?`
    )
    .get(indexedFile) as unknown as SessionIdentityRow | undefined
  return row
    ? {
        id: row.id,
        projectId: row.project_id,
        nativeSessionId: row.native_session_id,
        nativeSessionFile: row.native_session_file,
      }
    : null
}

export async function searchSessions(query: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const literalQuery = `"${query.replaceAll('"', '""')}"`
  const rows = database
    .prepare(
      `SELECT sessions.project_id,
              projects.display_name AS project_name,
              sessions.id AS session_id,
              sessions.title AS session_title,
              sessions.first_message AS session_first_message,
              session_search.entry_id,
              session_search.entry_type,
              session_search.timestamp,
              snippet(session_search, 4, '【', '】', '…', 24) AS snippet
       FROM session_search
       JOIN sessions ON sessions.id = session_search.session_id
       LEFT JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.archived_at IS NULL
         AND session_search MATCH ?
       ORDER BY rank, session_search.timestamp DESC
       LIMIT 100`
    )
    .all(literalQuery) as unknown as SearchRow[]
  return rows.map((row): SessionSearchResult => ({
    projectId: row.project_id,
    projectName: row.project_name,
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    sessionFirstMessage: row.session_first_message,
    entryId: row.entry_id,
    entryType: row.entry_type,
    timestamp: row.timestamp,
    snippet: row.snippet,
  }))
}
