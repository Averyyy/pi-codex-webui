import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { DatabaseSync } from "node:sqlite"

import { getDatabase } from "./database"
import { writeSecret } from "./secret-store"

test("database v1 migration preserves sessions and adds runtime bindings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-db-"))
  const previousConfigDir = process.env.PI_WEB_CODEX_CONFIG_DIR
  process.env.PI_WEB_CODEX_CONFIG_DIR = root
  const databasePath = path.join(root, "state.db")
  const legacy = new DatabaseSync(databasePath)
  legacy.exec("PRAGMA foreign_keys = ON;")
  legacy.exec(`
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
    INSERT INTO projects VALUES (
      'project-1', '/tmp/project', 'project',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO sessions VALUES (
      'session-1', 'project-1', 'pi', 'pi-default', 'native-1',
      '/tmp/session.jsonl', NULL, NULL,
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
      1, 'hello', '1', 2, 2, 1, 'hash', 'entry-1'
    );
    INSERT INTO session_entries VALUES (
      'session-1', 'entry-1', NULL, 'message',
      '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO session_search VALUES (
      'session-1', 'entry-1', 'message',
      '2026-01-01T00:00:00.000Z', 'hello'
    );
    PRAGMA user_version = 1;
  `)
  legacy.close()

  const migrated = await getDatabase()
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 5)
  assert.deepEqual(
    {
      ...migrated
        .prepare(
          `SELECT project_id, cwd, runtime_kind, runtime_profile_id,
                  migrated_from_session_id
           FROM sessions WHERE id = 'session-1'`
        )
        .get(),
    },
    {
      project_id: "project-1",
      cwd: "/tmp/project",
      runtime_kind: "pi",
      runtime_profile_id: "pi",
      migrated_from_session_id: null,
    }
  )
  const columns = migrated.prepare("PRAGMA table_info(sessions)").all() as {
    name: string
    notnull: number
  }[]
  assert.equal(columns.find(({ name }) => name === "project_id")?.notnull, 0)
  assert.equal(columns.find(({ name }) => name === "cwd")?.notnull, 1)
  assert.equal(columns.find(({ name }) => name === "pinned_at")?.notnull, 0)
  assert.equal(
    migrated
      .prepare(
        "SELECT count(*) AS count FROM session_entries WHERE session_id = 'session-1'"
      )
      .get()?.count,
    1
  )
  migrated
    .prepare(
      `UPDATE sessions SET runtime_kind = 'pi-client',
       runtime_profile_id = 'pi-client-default' WHERE id = 'session-1'`
    )
    .run()
  migrated.close()
  globalThis.piWebCodexDatabase = undefined

  const reference = await writeSecret("top-secret")
  const secretFile = path.join(root, "secrets", `${reference}.secret`)
  assert.equal(await readFile(secretFile, "utf8"), "top-secret")
  assert.equal((await stat(secretFile)).mode & 0o777, 0o600)
  await rm(root, { recursive: true, force: true })
  if (previousConfigDir === undefined)
    delete process.env.PI_WEB_CODEX_CONFIG_DIR
  else process.env.PI_WEB_CODEX_CONFIG_DIR = previousConfigDir
})

test("database v2 migration backfills cwd and permits standalone sessions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-db-v2-"))
  const previousConfigDir = process.env.PI_WEB_CODEX_CONFIG_DIR
  process.env.PI_WEB_CODEX_CONFIG_DIR = root
  const databasePath = path.join(root, "state.db")
  const legacy = new DatabaseSync(databasePath)
  legacy.exec("PRAGMA foreign_keys = ON;")
  legacy.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      canonical_path TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      default_runtime_profile_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE sessions (
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
    INSERT INTO projects VALUES (
      'project-2', '/work/project', 'project', 'pi-client',
      '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'
    );
    INSERT INTO sessions VALUES (
      'session-2', 'project-2', 'pi-client', 'pi-client', 'native-2',
      '/tmp/session-2.jsonl', NULL, 'title',
      '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z',
      1, 'hello', '1', 2, 2, 1, 'hash-2', 'entry-2', NULL
    );
    INSERT INTO session_entries VALUES (
      'session-2', 'entry-2', NULL, 'message',
      '2026-02-01T00:00:00.000Z'
    );
    INSERT INTO session_search VALUES (
      'session-2', 'entry-2', 'message',
      '2026-02-01T00:00:00.000Z', 'hello'
    );
    PRAGMA user_version = 2;
  `)
  legacy.close()

  const migrated = await getDatabase()
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 5)
  assert.deepEqual(
    {
      ...migrated
        .prepare(
          `SELECT project_id, cwd, runtime_kind, runtime_profile_id,
                  migrated_from_session_id
           FROM sessions WHERE id = 'session-2'`
        )
        .get(),
    },
    {
      project_id: "project-2",
      cwd: "/work/project",
      runtime_kind: "pi-client",
      runtime_profile_id: "pi-client",
      migrated_from_session_id: null,
    }
  )
  assert.deepEqual(
    {
      ...migrated
        .prepare(
          "SELECT session_id, entry_id FROM session_entries WHERE session_id = 'session-2'"
        )
        .get(),
    },
    { session_id: "session-2", entry_id: "entry-2" }
  )
  assert.equal(
    migrated
      .prepare(
        "SELECT count(*) AS count FROM session_search WHERE session_id = 'session-2'"
      )
      .get()?.count,
    1
  )
  migrated
    .prepare(
      `INSERT INTO sessions VALUES (
         'task-1', NULL, '/work/task', 'pi', 'pi', 'native-task',
         '/tmp/task.jsonl', NULL, NULL,
         '2026-02-02T00:00:00.000Z', '2026-02-02T00:00:00.000Z',
         0, '', '0', 1, 1, 1, 'task-hash', NULL, NULL, NULL, NULL
       )`
    )
    .run()
  assert.equal(
    migrated
      .prepare("SELECT project_id FROM sessions WHERE id = 'task-1'")
      .get()?.project_id,
    null
  )
  assert.equal(migrated.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1)
  migrated.prepare("DELETE FROM sessions WHERE id = 'session-2'").run()
  assert.equal(
    migrated
      .prepare(
        "SELECT count(*) AS count FROM session_entries WHERE session_id = 'session-2'"
      )
      .get()?.count,
    0
  )
  assert.deepEqual(migrated.prepare("PRAGMA foreign_key_check").all(), [])
  migrated.close()
  globalThis.piWebCodexDatabase = undefined
  await rm(root, { recursive: true, force: true })
  if (previousConfigDir === undefined)
    delete process.env.PI_WEB_CODEX_CONFIG_DIR
  else process.env.PI_WEB_CODEX_CONFIG_DIR = previousConfigDir
})
