import "server-only"

import { randomUUID } from "node:crypto"
import { realpath, rm, stat } from "node:fs/promises"
import path from "node:path"

import { getDatabase, inTransaction } from "@/lib/database"
import { latestPiGoalState } from "@/lib/pi-goal"
import {
  parsePiSession,
  readStablePiSessionFile,
  toTranscriptEntries,
} from "@/lib/pi-session"
import { syncPiProjectSessions, syncPiSessionFile } from "@/lib/session-index"
import { createSessionSearchPlan } from "@/lib/session-search-query"
import {
  parseSessionPageQuery,
  sessionPageCursor,
  type SessionPageQuery,
} from "@/lib/session-pagination"
import type {
  WorkspaceNavOrderMutation,
  WorkspaceNavOrderScope,
} from "@/lib/workspace-nav-order"
import type {
  ProjectSummary,
  ArchivedSession,
  SessionSearchResult,
  SessionSnapshot,
  SessionSummary,
  SessionPage,
  WorkspaceProject,
} from "@/lib/session-types"

interface ProjectRow {
  id: string
  canonical_path: string
  display_name: string
  session_count: number
  updated_at: string
  pinned_at: string | null
  nav_position: number | null
}

export class ProjectPathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProjectPathError"
  }
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
  completion_unread: 0 | 1
  runtime_kind: "pi" | "pi-client"
  runtime_profile_id: string
  migrated_from_session_id: string | null
  nav_position?: number | null
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
  entry_id: string | null
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

export type WorkspaceNavOrderInput = WorkspaceNavOrderMutation

export class WorkspaceNavOrderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceNavOrderError"
  }
}

declare global {
  var piWebCodexProjectRegistrations:
    Map<string, Promise<ProjectSummary>> | undefined
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
    hasUnreadCompletion: row.completion_unread === 1,
    runtimeKind: row.runtime_kind,
    runtimeProfileId: row.runtime_profile_id,
    migratedFromSessionId: row.migrated_from_session_id,
  }
}

function workspaceNavScopeKey(
  scope: WorkspaceNavOrderScope,
  projectId?: string | null
) {
  if (scope === "project") {
    if (!projectId) {
      throw new WorkspaceNavOrderError(
        "A projectId is required for project ordering."
      )
    }
    return `project:${projectId}`
  }
  if (projectId) {
    throw new WorkspaceNavOrderError(
      "projectId is only valid for project ordering."
    )
  }
  return scope
}

function refreshProject(
  database: Awaited<ReturnType<typeof getDatabase>>,
  projectId: string
) {
  database
    .prepare(
      `UPDATE projects SET
         created_at = coalesce(
           (SELECT min(created_at) FROM sessions
            WHERE project_id = ? AND parent_session_file IS NULL),
           created_at
         ),
         updated_at = coalesce(
           (SELECT max(updated_at) FROM sessions
            WHERE project_id = ? AND parent_session_file IS NULL),
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
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") return false
    throw error
  }
}

async function registerWorkspaceProject(canonicalPath: string) {
  const database = await getDatabase()
  const existing = database
    .prepare("SELECT id FROM projects WHERE canonical_path = ?")
    .get(canonicalPath) as { id: string } | undefined
  const projectId = existing?.id ?? randomUUID()
  const now = new Date().toISOString()
  const registrationAdded = inTransaction(database, () => {
    if (!existing) {
      database
        .prepare(
          `INSERT INTO projects(
             id, canonical_path, display_name, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?)`
        )
        .run(projectId, canonicalPath, path.basename(canonicalPath), now, now)
    }
    return (
      database
        .prepare(
          `INSERT INTO project_registrations(project_id, registered_at)
         VALUES (?, ?) ON CONFLICT(project_id) DO NOTHING`
        )
        .run(projectId, now).changes === 1
    )
  })

  try {
    await syncPiProjectSessions(projectId)
    const project = await getProject(projectId)
    if (!project) throw new Error("Registered project could not be loaded.")
    return project
  } catch (error) {
    if (registrationAdded) {
      database
        .prepare(
          `DELETE FROM project_registrations
           WHERE project_id = ? AND registered_at = ?`
        )
        .run(projectId, now)
    }
    throw error
  }
}

export async function addWorkspaceProject(inputPath: string) {
  const canonicalPath = await realpath(path.resolve(inputPath))
  if (!(await stat(canonicalPath)).isDirectory()) {
    throw new ProjectPathError("Project path must be a directory.")
  }

  const registrations = (globalThis.piWebCodexProjectRegistrations ??=
    new Map())
  const pending = registrations.get(canonicalPath)
  if (pending) return pending

  const registration = registerWorkspaceProject(canonicalPath).finally(() => {
    if (registrations.get(canonicalPath) === registration) {
      registrations.delete(canonicalPath)
    }
  })
  registrations.set(canonicalPath, registration)
  return registration
}

export async function renameWorkspaceProject(projectId: string, name: string) {
  const database = await getDatabase()
  const result = database
    .prepare(
      `UPDATE projects SET display_name = ?
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM project_registrations
         WHERE project_id = projects.id
       )`
    )
    .run(name, projectId)
  return result.changes === 1
}

export async function setProjectPinned(projectId: string, pinned: boolean) {
  const database = await getDatabase()
  const result = database
    .prepare(
      `UPDATE projects SET pinned_at = ?
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM project_registrations
         WHERE project_id = projects.id
       )`
    )
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

export async function markSessionCompleted(sessionId: string) {
  const database = await getDatabase()
  return (
    database
      .prepare(
        `UPDATE sessions SET completion_unread = 1
         WHERE id = ? AND archived_at IS NULL`
      )
      .run(sessionId).changes > 0
  )
}

export async function markSessionRead(sessionId: string) {
  const database = await getDatabase()
  return (
    database
      .prepare(
        `UPDATE sessions SET completion_unread = 0
         WHERE id = ? AND archived_at IS NULL`
      )
      .run(sessionId).changes > 0
  )
}

export async function removeWorkspaceProject(projectId: string) {
  const database = await getDatabase()
  return inTransaction(database, () => {
    const removed =
      database
        .prepare("DELETE FROM project_registrations WHERE project_id = ?")
        .run(projectId).changes === 1
    if (!removed) return false

    // A registration is a fresh sidebar item when it is added again. Clear
    // both its project rank and any session ranks scoped to the old project.
    database
      .prepare(
        `DELETE FROM workspace_nav_order
         WHERE (scope_key = 'projects' AND item_id = ?)
            OR scope_key = ?
            OR (scope_key = 'pinned' AND item_id IN (
              SELECT id FROM sessions WHERE project_id = ?
            ))`
      )
      .run(projectId, `project:${projectId}`, projectId)
    return true
  })
}

// Project selectors need identities only, not counts or conversation previews.
export async function listWorkspaceProjectChoices(): Promise<
  Pick<ProjectSummary, "id" | "name" | "path">[]
> {
  const database = await getDatabase()
  const rows = database
    .prepare(
      `
    SELECT projects.id, display_name AS name, canonical_path AS path
    FROM project_registrations
    JOIN projects ON projects.id = project_registrations.project_id
    LEFT JOIN workspace_nav_order AS nav_order
      ON nav_order.scope_key = 'projects'
     AND nav_order.item_id = projects.id
    ORDER BY projects.pinned_at IS NULL,
             nav_order.position IS NOT NULL, nav_order.position ASC,
             project_registrations.registered_at DESC,
             project_registrations.rowid DESC, projects.id DESC
  `
    )
    .all() as unknown as Pick<ProjectSummary, "id" | "name" | "path">[]
  return rows.map(({ id, name, path }) => ({ id, name, path }))
}

export async function listWorkspaceProjects(): Promise<WorkspaceProject[]> {
  const database = await getDatabase()
  const projects = database
    .prepare(
      `SELECT projects.id, canonical_path, display_name,
              count(sessions.id) AS session_count,
              projects.updated_at, projects.pinned_at,
              nav_order.position AS nav_position
       FROM project_registrations
       JOIN projects ON projects.id = project_registrations.project_id
       LEFT JOIN workspace_nav_order AS nav_order
         ON nav_order.scope_key = 'projects'
        AND nav_order.item_id = projects.id
       LEFT JOIN sessions
         ON sessions.project_id = projects.id
        AND sessions.archived_at IS NULL
        AND sessions.parent_session_file IS NULL
       GROUP BY projects.id
       ORDER BY projects.pinned_at IS NULL,
                nav_order.position IS NOT NULL, nav_order.position ASC,
                project_registrations.registered_at DESC,
                project_registrations.rowid DESC, projects.id DESC`
    )
    .all() as unknown as ProjectRow[]
  const sessions = database
    .prepare(
      `WITH previews AS (
         SELECT sessions.*,
                nav_order.position AS nav_position,
                row_number() OVER (
                  PARTITION BY project_id
                  ORDER BY nav_order.position IS NOT NULL,
                           nav_order.position ASC,
                           updated_at DESC, id DESC
                ) AS position
         FROM sessions
         LEFT JOIN workspace_nav_order AS nav_order
           ON nav_order.scope_key = 'project:' || sessions.project_id
          AND nav_order.item_id = sessions.id
         WHERE project_id IN (SELECT project_id FROM project_registrations)
           AND archived_at IS NULL AND parent_session_file IS NULL
           AND pinned_at IS NULL
       )
       SELECT id, project_id, cwd, native_session_id, native_session_file,
              parent_session_file, title, created_at, updated_at,
              message_count, substr(first_message, 1, 512) AS first_message, archived_at, pinned_at,
              completion_unread, runtime_kind,
              runtime_profile_id, migrated_from_session_id,
              nav_position
       FROM previews WHERE position <= 5
       ORDER BY position ASC`
    )
    .all() as unknown as SessionRow[]
  const byProject = new Map<string, SessionRow[]>()
  for (const session of sessions) {
    if (session.project_id === null) continue
    const projectSessions = byProject.get(session.project_id) ?? []
    projectSessions.push(session)
    byProject.set(session.project_id, projectSessions)
  }

  return projects.map((project) => ({
    ...projectSummary(project),
    sessions: (byProject.get(project.id) ?? []).map(sessionSummary),
  }))
}

export async function listSessionPage(
  input: SessionPageQuery
): Promise<SessionPage> {
  const query = parseSessionPageQuery(input)
  const database = await getDatabase()
  const sidebar = query.order === "sidebar"
  const scopeKey = sidebar
    ? workspaceNavScopeKey(query.scope, query.projectId)
    : null
  const filters = ["archived_at IS NULL", "parent_session_file IS NULL"]
  const values: (string | number)[] = sidebar && scopeKey ? [scopeKey] : []
  if (query.scope === "tasks") {
    filters.push("project_id IS NULL", "pinned_at IS NULL")
  } else if (query.scope === "pinned") {
    filters.push(
      "pinned_at IS NOT NULL",
      "(project_id IS NULL OR project_id IN (SELECT project_id FROM project_registrations))"
    )
  } else {
    filters.push("project_id = ?")
    values.push(query.projectId!)
    if (sidebar) filters.push("pinned_at IS NULL")
  }
  if (query.after && sidebar) {
    if (query.after.position === null) {
      filters.push(
        `((nav_order.position IS NULL AND
           (coalesce(pinned_at, ''), updated_at, id) < (?, ?, ?)) OR
          nav_order.position IS NOT NULL)`
      )
      values.push(query.after.pinnedAt, query.after.updatedAt, query.after.id)
    } else {
      filters.push(
        "(nav_order.position IS NOT NULL AND nav_order.position > ?)"
      )
      values.push(query.after.position)
    }
  } else if (query.after) {
    filters.push("(coalesce(pinned_at, ''), updated_at, id) < (?, ?, ?)")
    values.push(query.after.pinnedAt, query.after.updatedAt, query.after.id)
  }
  const rows = database
    .prepare(
      `SELECT id, project_id, cwd, native_session_id, native_session_file,
            parent_session_file, title, created_at, updated_at, message_count,
            substr(first_message, 1, 512) AS first_message, archived_at, pinned_at,
            completion_unread, runtime_kind, runtime_profile_id, migrated_from_session_id,
            ${sidebar ? "nav_order.position AS nav_position" : "NULL AS nav_position"}
     FROM sessions
     ${
       sidebar
         ? "LEFT JOIN workspace_nav_order AS nav_order ON nav_order.scope_key = ? AND nav_order.item_id = sessions.id"
         : ""
     }
     WHERE ${filters.join(" AND ")}
     ORDER BY
       ${sidebar ? "nav_order.position IS NOT NULL, nav_order.position ASC," : ""}
       coalesce(pinned_at, '') DESC, updated_at DESC, id DESC
     LIMIT ?`
    )
    .all(...values, query.limit + 1) as unknown as SessionRow[]
  const hasMore = rows.length > query.limit
  const page = rows.slice(0, query.limit)
  const last = page.at(-1)
  return {
    sessions: page.map(sessionSummary),
    nextCursor:
      hasMore && last
        ? sessionPageCursor({
            scope: query.scope,
            projectId: query.projectId ?? null,
            order: query.order,
            position: sidebar ? (last.nav_position ?? null) : null,
            pinnedAt: last.pinned_at ?? "",
            updatedAt: last.updated_at,
            id: last.id,
          })
        : null,
  }
}

function sidebarProjectIds(database: Awaited<ReturnType<typeof getDatabase>>) {
  return database
    .prepare(
      `SELECT projects.id
       FROM project_registrations
       JOIN projects ON projects.id = project_registrations.project_id
       LEFT JOIN workspace_nav_order AS nav_order
         ON nav_order.scope_key = 'projects'
        AND nav_order.item_id = projects.id
       ORDER BY projects.pinned_at IS NULL,
                nav_order.position IS NOT NULL, nav_order.position ASC,
                project_registrations.registered_at DESC,
                project_registrations.rowid DESC, projects.id DESC`
    )
    .all()
    .map((row) => String((row as { id: string }).id))
}

function persistWorkspaceNavOrder(
  database: Awaited<ReturnType<typeof getDatabase>>,
  scopeKey: string,
  ids: string[]
) {
  database
    .prepare("DELETE FROM workspace_nav_order WHERE scope_key = ?")
    .run(scopeKey)
  const insert = database.prepare(
    `INSERT INTO workspace_nav_order(scope_key, item_id, position)
     VALUES (?, ?, ?)`
  )
  for (const [position, itemId] of ids.entries()) {
    insert.run(scopeKey, itemId, position)
  }
}

function sidebarSessionIds(
  database: Awaited<ReturnType<typeof getDatabase>>,
  scope: Exclude<WorkspaceNavOrderScope, "projects" | "project"> | "project",
  projectId?: string
) {
  const filters = [
    "sessions.archived_at IS NULL",
    "sessions.parent_session_file IS NULL",
  ]
  const values: string[] = [
    `${scope === "project" ? `project:${projectId}` : scope}`,
  ]
  if (scope === "tasks") {
    filters.push("sessions.project_id IS NULL", "sessions.pinned_at IS NULL")
  } else if (scope === "pinned") {
    filters.push(
      "sessions.pinned_at IS NOT NULL",
      "(sessions.project_id IS NULL OR sessions.project_id IN (SELECT project_id FROM project_registrations))"
    )
  } else {
    if (!projectId) {
      throw new WorkspaceNavOrderError(
        "A projectId is required for project ordering."
      )
    }
    filters.push("sessions.project_id = ?", "sessions.pinned_at IS NULL")
    values.push(projectId)
  }
  return database
    .prepare(
      `SELECT sessions.id
       FROM sessions
       LEFT JOIN workspace_nav_order AS nav_order
         ON nav_order.scope_key = ?
        AND nav_order.item_id = sessions.id
       WHERE ${filters.join(" AND ")}
       ORDER BY nav_order.position IS NOT NULL, nav_order.position ASC,
                coalesce(sessions.pinned_at, '') DESC,
                sessions.updated_at DESC, sessions.id DESC`
    )
    .all(...values)
    .map((row) => String((row as { id: string }).id))
}

export async function reorderWorkspaceNav(input: WorkspaceNavOrderInput) {
  const database = await getDatabase()
  const scopeKey = workspaceNavScopeKey(input.scope, input.projectId)
  return inTransaction(database, () => {
    if (input.scope === "project") {
      const project = database
        .prepare("SELECT 1 FROM project_registrations WHERE project_id = ?")
        .get(input.projectId!)
      if (!project) throw new WorkspaceNavOrderError("Project not found.")
    }

    if (input.scope === "projects") {
      const projectRows = database
        .prepare(
          `SELECT projects.id, projects.pinned_at
           FROM project_registrations
           JOIN projects ON projects.id = project_registrations.project_id
           WHERE projects.id IN (?, ?)`
        )
        .all(input.itemId, input.targetId) as {
        id: string
        pinned_at: string | null
      }[]
      const item = projectRows.find((row) => row.id === input.itemId)
      const target = projectRows.find((row) => row.id === input.targetId)
      if (!item || !target) {
        throw new WorkspaceNavOrderError(
          "The item and target must belong to the same sidebar group."
        )
      }
      if ((item.pinned_at !== null) !== (target.pinned_at !== null)) {
        throw new WorkspaceNavOrderError(
          "Pinned and unpinned projects cannot be reordered together."
        )
      }
    }

    const ids =
      input.scope === "projects"
        ? sidebarProjectIds(database)
        : sidebarSessionIds(database, input.scope, input.projectId)
    if (input.itemId === input.targetId) {
      throw new WorkspaceNavOrderError(
        "The item and target must be different sidebar entries."
      )
    }
    const itemIndex = ids.indexOf(input.itemId)
    const targetIndex = ids.indexOf(input.targetId)
    if (itemIndex < 0 || targetIndex < 0) {
      throw new WorkspaceNavOrderError(
        "The item and target must belong to the same sidebar group."
      )
    }

    ids.splice(itemIndex, 1)
    const adjustedTargetIndex = ids.indexOf(input.targetId)
    ids.splice(
      adjustedTargetIndex + (input.position === "after" ? 1 : 0),
      0,
      input.itemId
    )

    persistWorkspaceNavOrder(database, scopeKey, ids)
    return ids
  })
}

export async function getProject(projectId: string) {
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT projects.id, canonical_path, display_name,
              count(sessions.id) AS session_count,
              projects.updated_at, projects.pinned_at
       FROM project_registrations
       JOIN projects ON projects.id = project_registrations.project_id
       LEFT JOIN sessions
         ON sessions.project_id = projects.id
        AND sessions.archived_at IS NULL
        AND sessions.parent_session_file IS NULL
       WHERE projects.id = ?
       GROUP BY projects.id`
    )
    .get(projectId) as unknown as ProjectRow | undefined
  return row ? projectSummary(row) : null
}

export async function listProjectSessions(projectId: string) {
  const database = await getDatabase()
  return (
    database
      .prepare(
        `SELECT id, project_id, cwd, native_session_id, native_session_file,
                parent_session_file, title, created_at, updated_at,
                message_count, first_message, archived_at, pinned_at,
                completion_unread, runtime_kind,
                runtime_profile_id, migrated_from_session_id
         FROM sessions
         WHERE project_id = ?
           AND archived_at IS NULL
           AND parent_session_file IS NULL
         ORDER BY pinned_at IS NULL, pinned_at DESC, updated_at DESC`
      )
      .all(projectId) as unknown as SessionRow[]
  ).map(sessionSummary)
}

export async function listSubagentSessions(sessionId: string) {
  const database = await getDatabase()
  const rows = database
    .prepare(
      `SELECT id, project_id, title, first_message, updated_at, message_count
       FROM sessions
       WHERE parent_session_file = (
         SELECT native_session_file FROM sessions WHERE id = ?
       )
         AND archived_at IS NULL
       ORDER BY updated_at DESC`
    )
    .all(sessionId) as {
    id: string
    project_id: string | null
    title: string | null
    first_message: string
    updated_at: string
    message_count: number
  }[]
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    firstMessage: row.first_message,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
  }))
}

export async function listWorkspaceTasks(): Promise<SessionSummary[]> {
  const database = await getDatabase()
  return (
    database
      .prepare(
        `SELECT id, project_id, cwd, native_session_id, native_session_file,
                parent_session_file, title, created_at, updated_at,
                message_count, first_message, archived_at, pinned_at,
                completion_unread, runtime_kind,
                runtime_profile_id, migrated_from_session_id
         FROM sessions
         WHERE project_id IS NULL
           AND archived_at IS NULL
           AND parent_session_file IS NULL
         ORDER BY pinned_at IS NULL, pinned_at DESC, updated_at DESC`
      )
      .all() as unknown as SessionRow[]
  ).map(sessionSummary)
}

export async function listArchivedSessions(): Promise<ArchivedSession[]> {
  const database = await getDatabase()
  const rows = database
    .prepare(
      `SELECT sessions.id, sessions.project_id, sessions.cwd,
              sessions.native_session_id, sessions.native_session_file,
              sessions.parent_session_file, sessions.title,
              sessions.created_at, sessions.updated_at,
              sessions.message_count, sessions.first_message,
              sessions.archived_at, sessions.pinned_at,
              sessions.completion_unread, sessions.runtime_kind,
              sessions.runtime_profile_id, sessions.migrated_from_session_id,
              projects.display_name AS project_name
       FROM sessions
       LEFT JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.archived_at IS NOT NULL
         AND sessions.parent_session_file IS NULL
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

export async function archiveProjectSessions(
  projectId: string,
  sessionIds: string[]
) {
  const ids = [...new Set(sessionIds)]
  if (ids.length === 0) return 0

  const database = await getDatabase()
  const archivedAt = new Date().toISOString()
  return inTransaction(database, () => {
    const archive = database.prepare(
      `UPDATE sessions
       SET archived_at = ?, pinned_at = NULL
       WHERE id = ? AND project_id = ? AND archived_at IS NULL`
    )
    let archived = 0
    for (const sessionId of ids) {
      archived += Number(archive.run(archivedAt, sessionId, projectId).changes)
    }
    return archived
  })
}

export async function isSessionArchived(sessionId: string) {
  const database = await getDatabase()
  return Boolean(
    database
      .prepare(
        `SELECT 1 FROM sessions
         WHERE id = ? AND archived_at IS NOT NULL`
      )
      .get(sessionId)
  )
}

export async function restoreArchivedSession(sessionId: string) {
  const database = await getDatabase()
  return (
    database
      .prepare(
        `UPDATE sessions SET archived_at = NULL
         WHERE id = ? AND archived_at IS NOT NULL`
      )
      .run(sessionId).changes === 1
  )
}

export async function deleteArchivedSession(sessionId: string) {
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

export async function getSessionSnapshot(
  sessionId: string,
  activeLeafId?: string | null
) {
  const database = await getDatabase()
  const loadSnapshotRow = () =>
    database
      .prepare(
        `SELECT sessions.id, project_id, sessions.cwd, native_session_id,
                native_session_file, parent_session_file, title,
                sessions.created_at, sessions.updated_at, message_count,
                first_message, archived_at, sessions.pinned_at,
                sessions.completion_unread,
                runtime_kind, runtime_profile_id,
                migrated_from_session_id,
                projects.canonical_path AS project_path,
                projects.display_name AS project_name
         FROM sessions
         LEFT JOIN projects ON projects.id = sessions.project_id
         WHERE sessions.id = ? AND sessions.archived_at IS NULL`
      )
      .get(sessionId) as unknown as SnapshotRow | undefined

  const indexed = loadSnapshotRow()
  if (!indexed) return null
  await syncPiSessionFile(indexed.native_session_file)
  const row = loadSnapshotRow()
  if (!row) return null

  const { content } = await readStablePiSessionFile(row.native_session_file)
  const parsed = parsePiSession(
    row.native_session_file,
    new TextDecoder("utf-8", { fatal: true }).decode(content),
    activeLeafId
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
    goalState: latestPiGoalState(parsed.activeBranch),
  } satisfies SessionSnapshot
}

export async function getSessionRuntimeTarget(sessionId: string) {
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
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT projects.id, canonical_path, default_runtime_profile_id
       FROM project_registrations
       JOIN projects ON projects.id = project_registrations.project_id
       WHERE projects.id = ?`
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
  const search = createSessionSearchPlan(query)
  if (
    !search.normalizedQuery ||
    (search.indexedTerms.length === 0 &&
      search.exactSubstringTerms.length === 0)
  ) {
    return []
  }

  const database = await getDatabase()
  const exactSubstringFilters = search.exactSubstringTerms.map(
    () => "pi_search_contains(session_search.text, ?) = 1"
  )
  const searchFilters = [
    ...(search.matchQuery ? ["session_search MATCH ?"] : []),
    ...exactSubstringFilters,
  ].join(" AND ")
  const snippet = search.matchQuery
    ? "snippet(session_search, 4, '【', '】', '…', 24)"
    : "pi_search_snippet(session_search.text, search_query.snippet_term)"
  const rows = database
    .prepare(
      `WITH RECURSIVE search_query(snippet_term) AS (VALUES (?)),
       active_entries(session_id, entry_id) AS (
         SELECT id, last_entry_id
         FROM sessions
         WHERE last_entry_id IS NOT NULL

         UNION ALL

         SELECT active_entries.session_id, session_entries.parent_id
         FROM active_entries
         JOIN session_entries
           ON session_entries.session_id = active_entries.session_id
          AND session_entries.entry_id = active_entries.entry_id
         WHERE session_entries.parent_id IS NOT NULL
       )
       SELECT sessions.project_id,
              projects.display_name AS project_name,
              sessions.id AS session_id,
              sessions.title AS session_title,
              sessions.first_message AS session_first_message,
              CASE
                WHEN session_search.entry_id = ''
                  AND session_search.entry_type = 'session_title'
                THEN NULL
                ELSE session_search.entry_id
              END AS entry_id,
              session_search.entry_type,
              session_search.timestamp,
              ${snippet} AS snippet
       FROM session_search
       JOIN sessions ON sessions.id = session_search.session_id
       LEFT JOIN projects ON projects.id = sessions.project_id
       CROSS JOIN search_query
       WHERE sessions.archived_at IS NULL
         AND sessions.parent_session_file IS NULL
         AND ${searchFilters}
         AND (
           (session_search.entry_id = ''
             AND session_search.entry_type = 'session_title')
           OR EXISTS (
             SELECT 1
             FROM active_entries
             WHERE active_entries.session_id = session_search.session_id
               AND active_entries.entry_id = session_search.entry_id
           )
         )
       ORDER BY ${search.matchQuery ? "rank," : ""}
         session_search.timestamp DESC
       LIMIT 100`
    )
    .all(
      search.exactSubstringTerms[0] ?? "",
      ...(search.matchQuery ? [search.matchQuery] : []),
      ...search.exactSubstringTerms
    ) as unknown as SearchRow[]
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
