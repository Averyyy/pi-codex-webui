import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  archiveSession,
  deleteArchivedSession,
  getProject,
  getSessionRuntimeTarget,
  getSessionSnapshot,
  isProjectDirectoryAvailable,
  listArchivedSessions,
  listWorkspaceProjects,
  listWorkspaceTasks,
  markSessionStandalone,
  searchSessions,
} from "./catalog"
import { getDatabase } from "./database"
import { syncPiSessionIndex } from "./session-index"

test("project availability accepts directories and suppresses only ENOENT", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-availability-"))
  try {
    const directory = path.join(root, "directory")
    const file = path.join(root, "file")
    await Promise.all([mkdir(directory), writeFile(file, "not a directory")])
    assert.equal(await isProjectDirectoryAvailable(directory), true)
    assert.equal(
      await isProjectDirectoryAvailable(path.join(root, "missing")),
      false
    )
    assert.equal(await isProjectDirectoryAvailable(file), false)
    await assert.rejects(
      isProjectDirectoryAvailable(path.join(file, "child")),
      (error: NodeJS.ErrnoException) => error.code === "ENOTDIR"
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function sessionJsonl(id: string, cwd: string, text: string) {
  const timestamp = "2026-07-14T00:00:00.000Z"
  return `${[
    { type: "session", version: 3, id, timestamp, cwd },
    {
      type: "message",
      id: `${id}-message`,
      parentId: null,
      timestamp,
      message: {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.parse(timestamp),
      },
    },
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n")}\n`
}

test("standalone sessions survive reindexing and remain outside projects", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-index-"))
  const configRoot = path.join(root, "config")
  const sessionRoot = path.join(root, "sessions")
  const projectCwd = path.join(root, "project")
  const taskCwd = path.join(root, "task")
  const previous = {
    config: process.env.PI_WEB_CODEX_CONFIG_DIR,
    sessions: process.env.PI_CODING_AGENT_SESSION_DIR,
  }
  process.env.PI_WEB_CODEX_CONFIG_DIR = configRoot
  process.env.PI_CODING_AGENT_SESSION_DIR = sessionRoot
  globalThis.piWebCodexDatabase = undefined
  globalThis.piWebCodexIndexSync = undefined

  try {
    await Promise.all([
      mkdir(sessionRoot, { recursive: true }),
      mkdir(projectCwd, { recursive: true }),
      mkdir(taskCwd, { recursive: true }),
    ])
    const projectFile = path.join(sessionRoot, "project.jsonl")
    const taskFile = path.join(sessionRoot, "task.jsonl")
    await Promise.all([
      writeFile(
        projectFile,
        sessionJsonl("native-project", projectCwd, "project message")
      ),
      writeFile(
        taskFile,
        sessionJsonl("native-task", taskCwd, "standalone needle")
      ),
    ])

    await syncPiSessionIndex()
    const imported = await listWorkspaceProjects()
    assert.equal(imported.length, 2)
    assert.deepEqual(await listWorkspaceTasks(), [])
    const projectSession = imported.find(({ path: cwd }) => cwd === projectCwd)
      ?.sessions[0]
    const taskSession = imported.find(({ path: cwd }) => cwd === taskCwd)
      ?.sessions[0]
    assert.ok(projectSession)
    assert.ok(taskSession)
    const projectId = projectSession.projectId
    assert.ok(projectId)

    await markSessionStandalone(taskSession.id, {
      cwd: taskCwd,
      runtimeKind: "pi-client",
      runtimeProfileId: "task-runtime",
      migratedFromSessionId: projectSession.id,
    })

    const projects = await listWorkspaceProjects()
    assert.deepEqual(
      projects.map(({ path: cwd }) => cwd),
      [projectCwd]
    )
    const [task] = await listWorkspaceTasks()
    assert.ok(task)
    assert.equal(task.projectId, null)
    assert.equal(task.cwd, taskCwd)
    assert.equal(task.runtimeKind, "pi-client")
    assert.equal(task.runtimeProfileId, "task-runtime")
    assert.equal(task.migratedFromSessionId, projectSession.id)

    const snapshot = await getSessionSnapshot(task.id)
    assert.ok(snapshot)
    assert.equal(snapshot.session.projectId, null)
    assert.equal(snapshot.session.projectPath, null)
    assert.equal(snapshot.session.projectName, null)
    assert.equal(snapshot.session.cwd, taskCwd)

    const target = await getSessionRuntimeTarget(task.id)
    assert.ok(target)
    assert.equal(target.projectId, null)
    assert.equal(target.cwd, taskCwd)
    assert.equal(target.runtimeProfileId, "task-runtime")

    const [searchResult] = await searchSessions("standalone needle")
    assert.ok(searchResult)
    assert.equal(searchResult.sessionId, task.id)
    assert.equal(searchResult.projectId, null)
    assert.equal(searchResult.projectName, null)

    await writeFile(
      taskFile,
      sessionJsonl("native-task", taskCwd, "standalone updated")
    )
    await syncPiSessionIndex()
    const [reindexed] = await listWorkspaceTasks()
    assert.equal(reindexed?.id, task.id)
    assert.equal(reindexed?.projectId, null)
    assert.equal(reindexed?.runtimeProfileId, "task-runtime")
    assert.equal(
      (await searchSessions("standalone updated"))[0]?.sessionId,
      task.id
    )

    const database = await getDatabase()
    database
      .prepare("DELETE FROM session_entries WHERE session_id = ?")
      .run(task.id)
    assert.equal(
      database
        .prepare(
          "SELECT count(*) AS count FROM session_entries WHERE session_id = ?"
        )
        .get(task.id)?.count,
      0
    )
    await syncPiSessionIndex()
    assert.equal(
      database
        .prepare(
          "SELECT count(*) AS count FROM session_entries WHERE session_id = ?"
        )
        .get(task.id)?.count,
      1
    )
    const [repaired] = await listWorkspaceTasks()
    assert.equal(repaired?.id, task.id)
    assert.equal(repaired?.projectId, null)
    assert.equal(repaired?.runtimeProfileId, "task-runtime")

    const archivedAt = await archiveSession(task.id)
    assert.ok(archivedAt)
    assert.deepEqual(await listWorkspaceTasks(), [])
    assert.equal((await listArchivedSessions())[0]?.id, task.id)
    assert.equal(await archiveSession(task.id), archivedAt)
    await syncPiSessionIndex()
    assert.equal((await listArchivedSessions())[0]?.id, task.id)
    assert.equal(await deleteArchivedSession(task.id), true)
    assert.deepEqual(await listArchivedSessions(), [])
    await assert.rejects(stat(taskFile))

    await rm(projectCwd, { recursive: true })
    assert.deepEqual(await listWorkspaceProjects(), [])
    assert.equal((await getProject(projectId))?.path, projectCwd)
  } finally {
    const database = await getDatabase()
    database.close()
    globalThis.piWebCodexDatabase = undefined
    globalThis.piWebCodexIndexSync = undefined
    if (previous.config === undefined)
      delete process.env.PI_WEB_CODEX_CONFIG_DIR
    else process.env.PI_WEB_CODEX_CONFIG_DIR = previous.config
    if (previous.sessions === undefined)
      delete process.env.PI_CODING_AGENT_SESSION_DIR
    else process.env.PI_CODING_AGENT_SESSION_DIR = previous.sessions
    await rm(root, { recursive: true, force: true })
  }
})
