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
  process.env.PI_WEB_CODEX_CONFIG_DIR = root
  const databasePath = path.join(root, "state.db")
  const legacy = new DatabaseSync(databasePath)
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
    INSERT INTO projects VALUES (
      'project-1', '/tmp/project', 'project',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO sessions VALUES (
      'session-1', 'project-1', 'pi', 'pi-default', 'native-1',
      '/tmp/session.jsonl', NULL, NULL,
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
      0, '', '0', 1, 1, 1, 'hash', NULL
    );
    PRAGMA user_version = 1;
  `)
  legacy.close()

  const migrated = await getDatabase()
  assert.equal(migrated.prepare("PRAGMA user_version").get()?.user_version, 2)
  assert.deepEqual(
    {
      ...migrated
        .prepare(
          `SELECT runtime_kind, runtime_profile_id, migrated_from_session_id
           FROM sessions WHERE id = 'session-1'`
        )
        .get(),
    },
    {
      runtime_kind: "pi",
      runtime_profile_id: "pi",
      migrated_from_session_id: null,
    }
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
})
