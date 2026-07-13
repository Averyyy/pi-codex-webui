import "server-only"

import { getDatabase } from "@/lib/database"
import {
  parsePiSession,
  readStablePiSessionFile,
  toTranscriptEntries,
} from "@/lib/pi-session"
import { syncPiSessionIndex } from "@/lib/session-index"
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
  project_id: string
  native_session_id: string
  native_session_file: string
  parent_session_file: string | null
  title: string | null
  created_at: string
  updated_at: string
  message_count: number
  first_message: string
  project_path?: string
  project_name?: string
}

interface SearchRow {
  project_id: string
  project_name: string
  session_id: string
  session_title: string | null
  session_first_message: string
  entry_id: string
  entry_type: string
  timestamp: string
  snippet: string
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
    nativeSessionId: row.native_session_id,
    nativeSessionFile: row.native_session_file,
    title: row.title,
    firstMessage: row.first_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
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
      `SELECT id, project_id, native_session_id, native_session_file,
              parent_session_file, title, created_at, updated_at,
              message_count, first_message
       FROM sessions
       ORDER BY updated_at DESC`
    )
    .all() as unknown as SessionRow[]
  const byProject = new Map<string, SessionRow[]>()
  for (const session of sessions) {
    const projectSessions = byProject.get(session.project_id) ?? []
    projectSessions.push(session)
    byProject.set(session.project_id, projectSessions)
  }

  return projects.map((project) => ({
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
        `SELECT id, project_id, native_session_id, native_session_file,
                parent_session_file, title, created_at, updated_at,
                message_count, first_message
         FROM sessions
         WHERE project_id = ?
         ORDER BY updated_at DESC`
      )
      .all(projectId) as unknown as SessionRow[]
  ).map(sessionSummary)
}

export async function getSessionSnapshot(sessionId: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT sessions.id, project_id, native_session_id,
              native_session_file, parent_session_file, title,
              sessions.created_at, sessions.updated_at, message_count,
              first_message, projects.canonical_path AS project_path,
              projects.display_name AS project_name
       FROM sessions
       JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.id = ?`
    )
    .get(sessionId) as unknown as SessionRow | undefined
  if (
    !row ||
    typeof row.project_path !== "string" ||
    typeof row.project_name !== "string"
  ) {
    return null
  }

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

export async function searchSessions(query: string) {
  await syncPiSessionIndex()
  const database = await getDatabase()
  const literalQuery = `"${query.replaceAll('"', '""')}"`
  const rows = database
    .prepare(
      `SELECT projects.id AS project_id,
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
       JOIN projects ON projects.id = sessions.project_id
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
