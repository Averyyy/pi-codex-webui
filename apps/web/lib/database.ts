import "server-only"

import { mkdir } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"

import { getAppPaths } from "./app-paths"

declare global {
  var piWebCodexDatabase: Promise<DatabaseSync> | undefined
}

const SCHEMA_VERSION = 5

async function openDatabase() {
  const paths = getAppPaths()
  await mkdir(paths.root, { recursive: true, mode: 0o700 })

  const database = new DatabaseSync(paths.database)
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")

  let version = database.prepare("PRAGMA user_version").get()?.user_version
  if (version === 1 || version === 2) {
    database.exec("PRAGMA foreign_keys = OFF;")
  }
  if (version === 0) {
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        canonical_path TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        default_runtime_profile_id TEXT,
        pinned_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        cwd TEXT NOT NULL,
        runtime_kind TEXT NOT NULL CHECK (runtime_kind IN ('pi', 'pi-client')),
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
        last_entry_id TEXT,
        archived_at TEXT,
        pinned_at TEXT,
        migrated_from_session_id TEXT REFERENCES sessions(id)
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
    version = SCHEMA_VERSION
  } else if (version === 1) {
    database.exec(`
      BEGIN IMMEDIATE;

      ALTER TABLE projects ADD COLUMN default_runtime_profile_id TEXT;
      DROP INDEX sessions_project_updated;

      CREATE TABLE sessions_v2 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        runtime_kind TEXT NOT NULL CHECK (runtime_kind IN ('pi', 'pi-client')),
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
        last_entry_id TEXT,
        migrated_from_session_id TEXT REFERENCES sessions_v2(id)
      ) STRICT;

      INSERT INTO sessions_v2(
        id, project_id, runtime_kind, runtime_profile_id,
        native_session_id, native_session_file, parent_session_file,
        title, created_at, updated_at, message_count, first_message,
        file_mtime_ns, indexed_size, indexed_lines, ends_with_newline,
        content_hash, last_entry_id, migrated_from_session_id
      )
      SELECT id, project_id, runtime_kind,
        CASE runtime_profile_id WHEN 'pi-default' THEN 'pi'
          ELSE runtime_profile_id END,
        native_session_id, native_session_file, parent_session_file,
        title, created_at, updated_at, message_count, first_message,
        file_mtime_ns, indexed_size, indexed_lines, ends_with_newline,
        content_hash, last_entry_id, NULL
      FROM sessions;

      DROP TABLE sessions;
      ALTER TABLE sessions_v2 RENAME TO sessions;
      CREATE INDEX sessions_project_updated
        ON sessions(project_id, updated_at DESC);

      PRAGMA user_version = 2;
      COMMIT;
    `)
    version = 2
  }

  if (version === 2) {
    database.exec(`
      BEGIN IMMEDIATE;

      DROP INDEX sessions_project_updated;

      CREATE TABLE sessions_v3 (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        cwd TEXT NOT NULL,
        runtime_kind TEXT NOT NULL CHECK (runtime_kind IN ('pi', 'pi-client')),
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
        last_entry_id TEXT,
        archived_at TEXT,
        migrated_from_session_id TEXT REFERENCES sessions_v3(id)
      ) STRICT;

      INSERT INTO sessions_v3(
        id, project_id, cwd, runtime_kind, runtime_profile_id,
        native_session_id, native_session_file, parent_session_file,
        title, created_at, updated_at, message_count, first_message,
        file_mtime_ns, indexed_size, indexed_lines, ends_with_newline,
        content_hash, last_entry_id, archived_at, migrated_from_session_id
      )
      SELECT sessions.id, sessions.project_id, projects.canonical_path,
        sessions.runtime_kind, sessions.runtime_profile_id,
        sessions.native_session_id, sessions.native_session_file,
        sessions.parent_session_file, sessions.title, sessions.created_at,
        sessions.updated_at, sessions.message_count, sessions.first_message,
        sessions.file_mtime_ns, sessions.indexed_size,
        sessions.indexed_lines, sessions.ends_with_newline,
        sessions.content_hash, sessions.last_entry_id, NULL,
        sessions.migrated_from_session_id
      FROM sessions
      LEFT JOIN projects ON projects.id = sessions.project_id;

      DROP TABLE sessions;
      ALTER TABLE sessions_v3 RENAME TO sessions;
      CREATE INDEX sessions_project_updated
        ON sessions(project_id, updated_at DESC);

      PRAGMA user_version = 4;
      COMMIT;
    `)
    version = 4
  }

  if (version === 3) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE sessions ADD COLUMN archived_at TEXT;
      PRAGMA user_version = 4;
      COMMIT;
    `)
    version = 4
  }

  if (version === 4) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE projects ADD COLUMN pinned_at TEXT;
      ALTER TABLE sessions ADD COLUMN pinned_at TEXT;
      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `)
    version = SCHEMA_VERSION
  }

  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported state.db schema ${String(version)}; expected ${SCHEMA_VERSION}.`
    )
  }

  database.exec("PRAGMA foreign_keys = ON;")

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
