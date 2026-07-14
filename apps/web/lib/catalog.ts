import "server-only"

import { stat } from "node:fs/promises"

import { getDatabase, inTransaction } from "@/lib/database"
import {
  parsePiSession,
  readStablePiSessionFile,
  toTranscriptEntries,
} from "@/lib/pi-session"
import { syncPiSessionFile, syncPiSessionIndex } from "@/lib/session-index"
import type {
  ProjectSummary,
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
  runtime_kind: "pi" | "pi-client"
  runtime_profile_id: string
  migrated_from_session_id: string | null
}

interface SnapshotRow extends SessionRow {
  project_path: string | null
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
    runtimeKind: row.runtime_kind,
    runtimeProfileId: row.runtime_profile_id,
    migratedFromSessionId: row.migrated_from_session_id,
  }
}

export async function isProjectDirectoryAvailable(canonicalPath: string) {
  try {
    return (await stat(canonicalPath)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function listWorkspaceProjects(): Promise<WorkspaceProject[]> {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const projects = database
    .prepare(
      `SELECT projects.id, canonical_path, display_name,
              count(sessions.id) AS session_count,
              projects.updated_at
       FROM projects
       JOIN sessions ON sessions.project_id = projects.id
       GROUP BY projects.id
       ORDER BY projects.updated_at DESC, display_name COLLATE NOCASE`
    )
    .all() as unknown as ProjectRow[]
  const sessions = database
    .prepare(
      `SELECT id, project_id, cwd, native_session_id, native_session_file,
              parent_session_file, title, created_at, updated_at,
              message_count, first_message, runtime_kind,
              runtime_profile_id, migrated_from_session_id
       FROM sessions
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
              projects.updated_at
       FROM projects
       JOIN sessions ON sessions.project_id = projects.id
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
                message_count, first_message, runtime_kind,
                runtime_profile_id, migrated_from_session_id
         FROM sessions
         WHERE project_id = ?
         ORDER BY updated_at DESC`
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
                message_count, first_message, runtime_kind,
                runtime_profile_id, migrated_from_session_id
         FROM sessions
         WHERE project_id IS NULL
         ORDER BY updated_at DESC`
      )
      .all() as unknown as SessionRow[]
  ).map(sessionSummary)
}

export async function getSessionSnapshot(sessionId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT sessions.id, project_id, sessions.cwd, native_session_id,
              native_session_file, parent_session_file, title,
              sessions.created_at, sessions.updated_at, message_count,
              first_message, runtime_kind, runtime_profile_id,
              migrated_from_session_id,
              projects.canonical_path AS project_path,
              projects.display_name AS project_name
       FROM sessions
       LEFT JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.id = ?`
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
       WHERE sessions.id = ?`
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

    if (session.project_id === null) return
    database
      .prepare(
        `DELETE FROM projects
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM sessions WHERE project_id = projects.id
           )`
      )
      .run(session.project_id)
    database
      .prepare(
        `UPDATE projects SET
           created_at = (SELECT min(created_at) FROM sessions WHERE project_id = ?),
           updated_at = (SELECT max(updated_at) FROM sessions WHERE project_id = ?)
         WHERE id = ?`
      )
      .run(session.project_id, session.project_id, session.project_id)
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
       WHERE session_search MATCH ?
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
