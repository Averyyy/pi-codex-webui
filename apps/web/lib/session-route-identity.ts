import "server-only"

import { stat } from "node:fs/promises"
import { getDatabase } from "@/lib/database"
import type { SessionSnapshot } from "@/lib/session-types"

interface SessionRouteRow {
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
  file_mtime_ns: string
  indexed_size: number
  first_message: string
  archived_at: string | null
  pinned_at: string | null
  completion_unread: 0 | 1
  runtime_kind: "pi" | "pi-client"
  runtime_profile_id: string
  migrated_from_session_id: string | null
  project_path: string | null
  project_name: string | null
}

export async function getSessionRouteIdentity(sessionId: string) {
  const database = await getDatabase()
  const row = database
    .prepare(
      `SELECT sessions.id, project_id, sessions.cwd, native_session_id,
              native_session_file, parent_session_file, title,
              sessions.created_at, sessions.updated_at, message_count,
              sessions.file_mtime_ns, sessions.indexed_size,
              substr(first_message, 1, 512) AS first_message,
              archived_at, sessions.pinned_at,
              sessions.completion_unread, runtime_kind, runtime_profile_id,
              migrated_from_session_id,
              projects.canonical_path AS project_path,
              projects.display_name AS project_name
       FROM sessions
       LEFT JOIN projects ON projects.id = sessions.project_id
       WHERE sessions.id = ? AND sessions.archived_at IS NULL`
    )
    .get(sessionId) as SessionRouteRow | undefined
  if (!row) return null
  const fileStats = await stat(row.native_session_file, { bigint: true })
  if (!fileStats.isFile())
    throw new Error("The selected native session path is not a file.")
  const nativeFileChanged =
    fileStats.mtimeNs.toString() !== row.file_mtime_ns ||
    fileStats.size !== BigInt(row.indexed_size)
  const nativeFileRevision = [
    fileStats.dev,
    fileStats.ino,
    fileStats.size,
    fileStats.mtimeNs,
    fileStats.ctimeNs,
  ]
    .map(String)
    .join(":")

  const session = {
    id: row.id,
    projectId: row.project_id,
    cwd: row.cwd,
    nativeSessionId: row.native_session_id,
    nativeSessionFile: row.native_session_file,
    parentSessionFile: row.parent_session_file,
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
    projectPath: row.project_path,
    projectName: row.project_name,
  } satisfies SessionSnapshot["session"]
  return { session, nativeFileChanged, nativeFileRevision }
}
