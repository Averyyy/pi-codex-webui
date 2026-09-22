import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  addWorkspaceProject,
  listSessionPage,
  listWorkspaceProjects,
  removeWorkspaceProject,
  reorderWorkspaceNav,
  setProjectPinned,
} from "./catalog"
import { getDatabase } from "./database"

async function withHarness(
  prefix: string,
  callback: (root: string) => Promise<void>
) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  const previous = {
    config: process.env.PI_WEB_CODEX_CONFIG_DIR,
    sessions: process.env.PI_CODING_AGENT_SESSION_DIR,
  }
  process.env.PI_WEB_CODEX_CONFIG_DIR = path.join(root, "config")
  process.env.PI_CODING_AGENT_SESSION_DIR = path.join(root, "sessions")
  globalThis.piWebCodexDatabase = undefined
  globalThis.piWebCodexIndexSync = undefined
  globalThis.piWebCodexProjectRegistrations = undefined
  try {
    await callback(root)
  } finally {
    const database = await getDatabase()
    database.close()
    globalThis.piWebCodexDatabase = undefined
    globalThis.piWebCodexIndexSync = undefined
    globalThis.piWebCodexProjectRegistrations = undefined
    if (previous.config === undefined)
      delete process.env.PI_WEB_CODEX_CONFIG_DIR
    else process.env.PI_WEB_CODEX_CONFIG_DIR = previous.config
    if (previous.sessions === undefined)
      delete process.env.PI_CODING_AGENT_SESSION_DIR
    else process.env.PI_CODING_AGENT_SESSION_DIR = previous.sessions
    await rm(root, { recursive: true, force: true })
  }
}

test("sidebar projects prepend new registrations and persist manual order", async () => {
  await withHarness("pi-web-codex-sidebar-projects-", async (root) => {
    const projectPaths = ["one", "two", "three"].map((name) =>
      path.join(root, name)
    )
    await Promise.all(projectPaths.map((projectPath) => mkdir(projectPath)))
    const projects = []
    for (const projectPath of projectPaths) {
      projects.push(await addWorkspaceProject(projectPath))
    }

    assert.deepEqual(
      (await listWorkspaceProjects()).map((project) => project.id),
      [projects[2]!.id, projects[1]!.id, projects[0]!.id]
    )

    assert.equal(await setProjectPinned(projects[0]!.id, true), true)
    assert.deepEqual(
      (await listWorkspaceProjects()).map((project) => project.id),
      [projects[0]!.id, projects[2]!.id, projects[1]!.id]
    )
    await assert.rejects(
      reorderWorkspaceNav({
        scope: "projects",
        itemId: projects[2]!.id,
        targetId: projects[0]!.id,
        position: "before",
      }),
      /Pinned and unpinned projects/
    )
    assert.equal(await setProjectPinned(projects[1]!.id, true), true)
    await reorderWorkspaceNav({
      scope: "projects",
      itemId: projects[0]!.id,
      targetId: projects[1]!.id,
      position: "before",
    })
    assert.deepEqual(
      (await listWorkspaceProjects()).map((project) => project.id),
      [projects[0]!.id, projects[1]!.id, projects[2]!.id]
    )
    assert.equal(await setProjectPinned(projects[0]!.id, false), true)
    assert.deepEqual(
      (await listWorkspaceProjects()).map((project) => project.id),
      [projects[1]!.id, projects[0]!.id, projects[2]!.id]
    )

    await reorderWorkspaceNav({
      scope: "projects",
      itemId: projects[2]!.id,
      targetId: projects[0]!.id,
      position: "before",
    })
    assert.deepEqual(
      (await listWorkspaceProjects()).map((project) => project.id),
      [projects[1]!.id, projects[2]!.id, projects[0]!.id]
    )

    const fourthPath = path.join(root, "four")
    await mkdir(fourthPath)
    const fourth = await addWorkspaceProject(fourthPath)
    assert.deepEqual(
      (await listWorkspaceProjects()).map((project) => project.id),
      [projects[1]!.id, fourth.id, projects[2]!.id, projects[0]!.id]
    )

    await removeWorkspaceProject(projects[0]!.id)
    const readded = await addWorkspaceProject(projectPaths[0]!)
    assert.equal(readded.id, projects[0]!.id)
    assert.deepEqual(
      (await listWorkspaceProjects()).map((project) => project.id),
      [projects[1]!.id, projects[0]!.id, fourth.id, projects[2]!.id]
    )
  })
})

function insertSession(
  database: Awaited<ReturnType<typeof getDatabase>>,
  root: string,
  input: {
    id: string
    projectId?: string | null
    updatedAt?: string
    pinnedAt?: string | null
  }
) {
  const updatedAt = input.updatedAt ?? "2026-09-22T00:00:00.000Z"
  database
    .prepare(
      `INSERT INTO sessions(
         id, project_id, cwd, runtime_kind, runtime_profile_id,
         native_session_id, native_session_file, parent_session_file,
         title, created_at, updated_at, message_count, first_message,
         file_mtime_ns, indexed_size, indexed_lines, ends_with_newline,
         content_hash, index_generation, last_entry_id, archived_at,
         pinned_at, completion_unread, migrated_from_session_id
       ) VALUES (?, ?, ?, 'pi', 'pi', ?, ?, NULL, NULL, ?, ?, 1, ?,
                 '0', 1, 1, 1, ?, 0, NULL, NULL, ?, 0, NULL)`
    )
    .run(
      input.id,
      input.projectId ?? null,
      root,
      `native-${input.id}`,
      path.join(root, `${input.id}.jsonl`),
      updatedAt,
      updatedAt,
      `message-${input.id}`,
      `hash-${input.id}`,
      input.pinnedAt ?? null
    )
}

test("sidebar session pages follow persisted order across pages and exclude pinned project sessions", async () => {
  await withHarness("pi-web-codex-sidebar-sessions-", async (root) => {
    const projectPath = path.join(root, "project")
    await mkdir(projectPath)
    const project = await addWorkspaceProject(projectPath)
    const database = await getDatabase()
    for (let index = 0; index < 12; index++) {
      insertSession(database, root, {
        id: `task-${String(index).padStart(2, "0")}`,
      })
    }
    insertSession(database, root, {
      id: "project-visible",
      projectId: project.id,
    })
    insertSession(database, root, {
      id: "project-pinned",
      projectId: project.id,
      pinnedAt: "2026-09-22T00:00:00.000Z",
    })

    const first = await listSessionPage({
      scope: "tasks",
      order: "sidebar",
      limit: 5,
    })
    assert.deepEqual(
      first.sessions.map((session) => session.id),
      ["task-11", "task-10", "task-09", "task-08", "task-07"]
    )

    await reorderWorkspaceNav({
      scope: "tasks",
      itemId: "task-00",
      targetId: "task-11",
      position: "before",
    })
    insertSession(database, root, { id: "task-12" })

    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await listSessionPage({
        scope: "tasks",
        order: "sidebar",
        limit: 5,
        cursor,
      })
      seen.push(...page.sessions.map((session) => session.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    assert.deepEqual(seen, [
      "task-12",
      "task-00",
      "task-11",
      "task-10",
      "task-09",
      "task-08",
      "task-07",
      "task-06",
      "task-05",
      "task-04",
      "task-03",
      "task-02",
      "task-01",
    ])

    const projectPage = await listSessionPage({
      scope: "project",
      projectId: project.id,
      order: "sidebar",
      limit: 5,
    })
    assert.deepEqual(
      projectPage.sessions.map((session) => session.id),
      ["project-visible"]
    )
  })
})
