import "server-only"

import { mkdir } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"

import { getAppPaths } from "@/lib/app-paths"

declare global {
  var piWebCodexDatabase: Promise<DatabaseSync> | undefined
}

const SCHEMA_VERSION = 1

async function openDatabase() {
  const paths = getAppPaths()
  await mkdir(paths.root, { recursive: true, mode: 0o700 })

  const database = new DatabaseSync(paths.database)
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")

  const version = database.prepare("PRAGMA user_version").get()?.user_version
  if (version === 0) {
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        canonical_path TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        runtime_kind TEXT NOT NULL CHECK (runtime_kind = 'pi'),
        runtime_profile_id TEXT NOT NULL,
        native_session_id TEXT NOT NULL,
        native_session_file TEXT NOT NULL UNIQUE,
        parent_session_file TEXT,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        first_message TEXT NOT NULL,
        file_mtime_ns TEXT NOT NULL,
        indexed_size INTEGER NOT NULL,
        indexed_lines INTEGER NOT NULL,
        ends_with_newline INTEGER NOT NULL CHECK (ends_with_newline IN (0, 1)),
        content_hash TEXT NOT NULL,
        last_entry_id TEXT
      ) STRICT;

      CREATE INDEX sessions_project_updated
        ON sessions(project_id, updated_at DESC);

      CREATE TABLE session_entries (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        entry_id TEXT NOT NULL,
        parent_id TEXT,
        entry_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        PRIMARY KEY (session_id, entry_id),
        FOREIGN KEY (session_id, parent_id)
          REFERENCES session_entries(session_id, entry_id)
          DEFERRABLE INITIALLY DEFERRED
      ) STRICT;

      CREATE VIRTUAL TABLE session_search USING fts5(
        session_id UNINDEXED,
        entry_id UNINDEXED,
        entry_type UNINDEXED,
        timestamp UNINDEXED,
        text,
        tokenize = 'unicode61'
      );

      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `)
  } else if (version !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported state.db schema ${String(version)}; expected ${SCHEMA_VERSION}.`
    )
  }

  return database
}

export function getDatabase() {
  globalThis.piWebCodexDatabase ??= openDatabase()
  return globalThis.piWebCodexDatabase
}

export function inTransaction<T>(database: DatabaseSync, operation: () => T) {
  database.exec("BEGIN IMMEDIATE")
  try {
    const result = operation()
    database.exec("COMMIT")
    return result
  } catch (error) {
    database.exec("ROLLBACK")
    throw error
  }
}
