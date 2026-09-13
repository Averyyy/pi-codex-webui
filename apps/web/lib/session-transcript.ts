import "server-only"

import { open } from "node:fs/promises"
import { z } from "zod"

import { getDatabase } from "@/lib/database"
import { latestPiGoalState } from "@/lib/pi-goal"
import {
  parsePiSessionEntries,
  toTranscriptEntries,
  type PiSessionEntry,
  type ParsedPiSession,
} from "@/lib/pi-session"
import { resolvePiSessionFile, syncPiSessionFile } from "@/lib/session-index"
import type { SessionSnapshot, TranscriptEntry } from "@/lib/session-types"

export const TRANSCRIPT_PAGE_ENTRIES = 60
export const TRANSCRIPT_PAGE_BYTES = 256 * 1024

interface EntryLocation {
  entry_id: string
  parent_id: string | null
  entry_type: string
  timestamp: string
  byte_offset: number | null
  byte_length: number | null
  line_number: number | null
  message_role: string | null
  custom_type: string | null
}

const cursorSchema = z
  .object({
    sessionId: z.string(),
    leafId: z.string().nullable(),
    beforeId: z.string().nullable(),
  })
  .strict()

export function decodeTranscriptCursor(value: string, sessionId: string) {
  if (value.length > 4096 || !/^[\w-]+$/.test(value))
    throw new Error("Invalid history cursor.")
  const cursor = cursorSchema.parse(
    JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
  )
  if (cursor.sessionId !== sessionId)
    throw new Error("History cursor belongs to another session.")
  return cursor
}

function encodeCursor(value: z.infer<typeof cursorSchema>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

async function readEntry(file: string, location: EntryLocation) {
  if (
    location.byte_offset === null ||
    location.byte_length === null ||
    location.line_number === null
  ) {
    throw new Error("Session byte index is incomplete.")
  }
  const handle = await open(file, "r")
  try {
    const content = Buffer.alloc(location.byte_length)
    let offset = 0
    while (offset < content.length) {
      const { bytesRead } = await handle.read(
        content,
        offset,
        content.length - offset,
        location.byte_offset + offset
      )
      if (!bytesRead)
        throw new Error(
          "Session changed while reading history. Reload the conversation."
        )
      offset += bytesRead
    }
    const entries = parsePiSessionEntries(
      file,
      new TextDecoder("utf-8", { fatal: true }).decode(content),
      location.line_number
    )
    const entry = entries[0]
    if (
      entries.length !== 1 ||
      entry?.id !== location.entry_id ||
      entry.parentId !== location.parent_id
    ) {
      throw new Error(
        "Session byte index does not match the source. Reload the conversation."
      )
    }
    return entry
  } finally {
    await handle.close()
  }
}

export async function getSessionTranscriptPage(
  sessionId: string,
  options: {
    cursor?: string
    leafId?: string | null
    entryId?: string
    focusId?: string
    sync?: boolean
    previousLeaf?: string | null
  } = {}
): Promise<SessionSnapshot | null> {
  const cursor = options.cursor
    ? decodeTranscriptCursor(options.cursor, sessionId)
    : null
  const database = await getDatabase()
  const load = () =>
    database
      .prepare(
        `
    SELECT sessions.id, sessions.project_id, sessions.cwd, sessions.native_session_id,
           sessions.native_session_file, sessions.parent_session_file,
           substr(sessions.title, 1, 256) AS title,
           substr(sessions.first_message, 1, 512) AS first_message,
           sessions.created_at, sessions.updated_at, sessions.message_count,
           sessions.archived_at, sessions.pinned_at, sessions.completion_unread,
           sessions.runtime_kind, sessions.runtime_profile_id, sessions.migrated_from_session_id,
           sessions.last_entry_id, sessions.content_hash, sessions.index_generation,
           projects.canonical_path AS project_path,
           projects.display_name AS project_name
    FROM sessions LEFT JOIN projects ON projects.id = sessions.project_id
    WHERE sessions.id = ? AND sessions.archived_at IS NULL
  `
      )
      .get(sessionId) as
      | {
          id: string
          project_id: string | null
          cwd: string
          native_session_id: string
          native_session_file: string
          parent_session_file: string | null
          title: string | null
          first_message: string
          created_at: string
          updated_at: string
          message_count: number
          archived_at: string | null
          pinned_at: string | null
          completion_unread: number
          runtime_kind: "pi" | "pi-client"
          runtime_profile_id: string
          migrated_from_session_id: string | null
          last_entry_id: string | null
          project_path: string | null
          project_name: string | null
          content_hash: string
          index_generation: number
        }
      | undefined
  let row = load()
  if (!row) return null
  if (options.sync !== false) await syncPiSessionFile(row.native_session_file)
  row = load()
  if (!row) return null
  await resolvePiSessionFile(row.native_session_file)
  const leafId = cursor ? cursor.leafId : options.leafId === undefined ? row.last_entry_id : options.leafId
  const locationStatement = database.prepare("SELECT entry_id, parent_id, entry_type, timestamp, byte_offset, byte_length, line_number, message_role, custom_type FROM session_entries WHERE session_id = ? AND entry_id = ?")
  const ancestorStatement = database.prepare("WITH RECURSIVE ancestors(entry_id, parent_id) AS (SELECT entry_id, parent_id FROM session_entries WHERE session_id = ? AND entry_id = ? UNION SELECT parent.entry_id, parent.parent_id FROM session_entries parent JOIN ancestors child ON child.parent_id = parent.entry_id WHERE parent.session_id = ?) SELECT 1 FROM ancestors WHERE entry_id = ? LIMIT 1")
  const isAncestor = (id: string | null) => id === null || (leafId !== null && Boolean(ancestorStatement.get(sessionId, leafId, sessionId, id)))
  const startId = options.entryId ?? options.focusId ?? (cursor ? cursor.beforeId : leafId)
  if (startId !== leafId && !isAncestor(startId)) throw new Error("History cursor is outside the selected branch.")
  const selected: EntryLocation[] = []
  const visited = new Set<string>()
  let id = startId
  let bytes = 0
  while (id !== null && selected.length < TRANSCRIPT_PAGE_ENTRIES) {
    if (visited.has(id)) throw new Error("Session history contains a cycle.")
    visited.add(id)
    const location = locationStatement.get(sessionId, id) as unknown as EntryLocation | undefined
    if (!location) throw new Error("Session history cursor no longer exists. Reload the conversation.")
    if (location.byte_length === null) throw new Error("Session byte index is incomplete.")
    const cost = location.byte_length <= TRANSCRIPT_PAGE_BYTES ? location.byte_length : 0
    if (!options.entryId && selected.length && bytes + cost > TRANSCRIPT_PAGE_BYTES) break
    selected.push(location)
    bytes += cost
    if (options.entryId || location.entry_type === "compaction") break
    id = location.parent_id
  }
  type Navigation = NonNullable<Extract<TranscriptEntry, { kind: "message" }>["branch"]>
  const navigation = new Map<string, Navigation>()
  const siblingsStatement = database.prepare("SELECT entry_id FROM session_entries WHERE session_id = ? AND parent_id IS ? AND message_role = 'user' ORDER BY byte_offset")
  const latestLeafStatement = database.prepare("WITH RECURSIVE descendants(entry_id) AS (SELECT entry_id FROM session_entries WHERE session_id = ? AND entry_id = ? UNION SELECT child.entry_id FROM session_entries child JOIN descendants parent ON child.parent_id = parent.entry_id WHERE child.session_id = ?) SELECT entry.entry_id FROM descendants JOIN session_entries entry ON entry.entry_id = descendants.entry_id AND entry.session_id = ? WHERE NOT EXISTS (SELECT 1 FROM session_entries child WHERE child.session_id = ? AND child.parent_id = entry.entry_id) ORDER BY entry.byte_offset DESC LIMIT 1")
  for (const location of selected) {
    if (location.message_role !== "user") continue
    const siblings = siblingsStatement.all(sessionId, location.parent_id) as { entry_id: string }[]
    if (siblings.length < 2) continue
    const index = siblings.findIndex(sibling => sibling.entry_id === location.entry_id)
    const leaf = (sibling: { entry_id: string } | undefined) => {
      if (!sibling) return undefined
      const found = latestLeafStatement.get(sessionId, sibling.entry_id, sessionId, sessionId, sessionId) as { entry_id: string } | undefined
      return found && found.entry_id !== sibling.entry_id ? found.entry_id : undefined
    }
    navigation.set(location.entry_id, { index: index + 1, total: siblings.length, previousEntryId: leaf(siblings[index - 1]), nextEntryId: leaf(siblings[index + 1]) })
  }

  const deferred = new Map<string, TranscriptEntry>()
  const entries: PiSessionEntry[] = []
  for (const location of selected.slice().reverse()) {
    if (!options.entryId && location.byte_length! > TRANSCRIPT_PAGE_BYTES) {
      deferred.set(location.entry_id, {
        kind: "event",
        id: location.entry_id,
        timestamp: location.timestamp,
        eventType: "deferred_entry",
        title: "按需加载的记录",
        deferred: { byteLength: location.byte_length! },
      })
      entries.push({
        type: "label",
        id: location.entry_id,
        parentId: location.parent_id,
        timestamp: location.timestamp,
      })
    } else entries.push(await readEntry(row.native_session_file, location))
  }
  const parsed: ParsedPiSession = {
    header: {
      type: "session",
      id: row.native_session_id,
      timestamp: row.created_at,
      cwd: row.cwd,
    },
    entries,
    activeBranch: entries,
    firstMessage: row.first_message,
    messageCount: row.message_count,
    updatedAt: row.updated_at,
  }
  const converted = new Map(
    toTranscriptEntries(parsed, navigation).map((entry) => [entry.id, entry])
  )
  const transcript = entries.flatMap((entry) => {
    const value = deferred.get(entry.id) ?? converted.get(entry.id)
    return value ? [value] : []
  })
  const hasGoal = database.prepare("SELECT 1 FROM session_entries WHERE session_id = ? AND entry_type = 'custom' AND custom_type = 'goal-state' LIMIT 1").get(sessionId)
  const goalLocation = hasGoal && leafId !== null ? database.prepare("WITH RECURSIVE ancestors(entry_id, parent_id, depth) AS (SELECT entry_id, parent_id, 0 FROM session_entries WHERE session_id = ? AND entry_id = ? UNION ALL SELECT parent.entry_id, parent.parent_id, child.depth + 1 FROM session_entries parent JOIN ancestors child ON child.parent_id = parent.entry_id WHERE parent.session_id = ?) SELECT entry.* FROM ancestors JOIN session_entries entry ON entry.entry_id = ancestors.entry_id AND entry.session_id = ? WHERE entry.entry_type = 'custom' AND entry.custom_type = 'goal-state' ORDER BY ancestors.depth LIMIT 1").get(sessionId, leafId, sessionId, sessionId) as unknown as EntryLocation | undefined : undefined
  const goal = goalLocation
    ? await readEntry(row.native_session_file, goalLocation)
    : null
  const oldest = selected.at(-1)
  return {
    session: {
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
      projectPath: row.project_path,
      projectName: row.project_name,
      parentSessionFile: row.parent_session_file,
    },
    entries: transcript,
    goalState: goal ? latestPiGoalState([goal]) : null,
    history: {
      leafId,
      nextCursor:
        !options.entryId && oldest?.parent_id
          ? encodeCursor({ sessionId, leafId, beforeId: oldest.parent_id })
          : null,
      boundary: oldest?.entry_type === "compaction" ? "compaction" : "page",
      entryIds: selected.map((entry) => entry.entry_id).reverse(),
      extendsLeaf:
        options.previousLeaf === undefined
          ? undefined
          : isAncestor(options.previousLeaf),
      sourceHash: row.content_hash,
      anchorCursor: encodeCursor({ sessionId, leafId, beforeId: leafId }),
      generation: row.index_generation,
      atLatest: startId === leafId,
    },
  }
}
