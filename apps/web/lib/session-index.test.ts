import assert from "node:assert/strict"
import {
  appendFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { GET as getProjectRoute } from "../app/api/v1/projects/[projectId]/route"
import {
  addWorkspaceProject,
  archiveProjectSessions,
  archiveSession,
  deleteArchivedSession,
  getProject,
  getSessionIdentityByNativeFile,
  getSessionRuntimeTarget,
  getSessionSnapshot,
  isProjectDirectoryAvailable,
  isSessionArchived,
  listArchivedSessions,
  listProjectSessions,
  listSubagentSessions,
  listWorkspaceProjects,
  listWorkspaceTasks,
  markSessionCompleted,
  markSessionRead,
  markSessionStandalone,
  removeWorkspaceProject,
  restoreArchivedSession,
  searchSessions,
  setProjectPinned,
  setSessionPinned,
} from "./catalog"
import { getDatabase } from "./database"
import { syncPiSessionIndex } from "./session-index"

test("project availability treats missing and invalidated paths as unavailable", async () => {
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
    assert.equal(
      await isProjectDirectoryAvailable(path.join(file, "child")),
      false
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function sessionJsonl(
  id: string,
  cwd: string,
  text: string,
  title?: string,
  parentSession?: string
) {
  const timestamp = "2026-07-14T00:00:00.000Z"
  const entries = [
    {
      type: "session",
      version: 3,
      id,
      timestamp,
      cwd,
      ...(parentSession ? { parentSession } : {}),
    },
    ...(title
      ? [
          {
            type: "session_info",
            id: `${id}-title`,
            parentId: null,
            timestamp,
            name: title,
          },
        ]
      : []),
    {
      type: "message",
      id: `${id}-message`,
      parentId: title ? `${id}-title` : null,
      timestamp,
      message: {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.parse(timestamp),
      },
    },
  ]
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`
}

test("keeps tintinweb child sessions out of user-facing catalogs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-subagents-"))
  const configRoot = path.join(root, "config")
  const sessionRoot = path.join(root, "sessions")
  const projectCwd = path.join(root, "project")
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
    ])
    const parentFile = path.join(sessionRoot, "parent.jsonl")
    const childFile = path.join(sessionRoot, "child.jsonl")
    await Promise.all([
      writeFile(
        parentFile,
        sessionJsonl("native-parent", projectCwd, "parent message", "Parent")
      ),
      writeFile(
        childFile,
        sessionJsonl(
          "native-child",
          projectCwd,
          "child-only needle",
          "general-purpose#child",
          parentFile
        )
      ),
    ])

    const project = await addWorkspaceProject(projectCwd)
    const parent = await getSessionIdentityByNativeFile(parentFile)
    const child = await getSessionIdentityByNativeFile(childFile)
    assert.ok(parent)
    assert.ok(child)

    const projects = await listWorkspaceProjects()
    assert.equal(projects[0]?.sessionCount, 1)
    assert.deepEqual(
      projects[0]?.sessions.map((session) => session.id),
      [parent.id]
    )
    assert.deepEqual(
      (await listProjectSessions(project.id)).map((session) => session.id),
      [parent.id]
    )
    assert.deepEqual(await searchSessions("child-only needle"), [])

    const childSnapshot = await getSessionSnapshot(child.id)
    assert.equal(childSnapshot?.session.parentSessionFile, parentFile)
    assert.deepEqual(
      (await listSubagentSessions(parent.id)).map((session) => session.id),
      [child.id]
    )
    await archiveSession(child.id)
    assert.equal(
      (await listArchivedSessions()).some((session) => session.id === child.id),
      false
    )
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
})

function branchedSessionJsonl(id: string, cwd: string) {
  const timestamp = "2026-07-14T00:00:00.000Z"
  const entries = [
    { type: "session", version: 3, id, timestamp, cwd },
    {
      type: "session_info",
      id: `${id}-title`,
      parentId: null,
      timestamp,
      name: "Branch search title",
    },
    {
      type: "message",
      id: `${id}-user`,
      parentId: `${id}-title`,
      timestamp: "2026-07-14T00:00:01.000Z",
      message: { role: "user", content: "choose a branch" },
    },
    {
      type: "message",
      id: `${id}-abandoned`,
      parentId: `${id}-user`,
      timestamp: "2026-07-14T00:00:02.000Z",
      message: {
        role: "assistant",
        content: "abandoned-only-needle",
      },
    },
    {
      type: "message",
      id: `${id}-active`,
      parentId: `${id}-user`,
      timestamp: "2026-07-14T00:00:03.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: `${id}-call`,
            name: "read",
            arguments: { path: "active-branch.txt" },
          },
        ],
      },
    },
    {
      type: "message",
      id: `${id}-result`,
      parentId: `${id}-active`,
      timestamp: "2026-07-14T00:00:04.000Z",
      message: {
        role: "toolResult",
        toolCallId: `${id}-call`,
        toolName: "read",
        content: "active-result-needle",
      },
    },
  ]
  return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`
}

test("standalone sessions survive reindexing and remain outside projects", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-index-"))
  const configRoot = path.join(root, "config")
  const sessionRoot = path.join(root, "sessions")
  const projectCwd = path.join(root, "project")
  const taskCwd = path.join(root, "task")
  const emptyCwd = path.join(root, "empty-project")
  const failingCwd = path.join(root, "failing-project")
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
      mkdir(emptyCwd, { recursive: true }),
      mkdir(failingCwd, { recursive: true }),
    ])
    const projectFile = path.join(sessionRoot, "project.jsonl")
    const taskFile = path.join(sessionRoot, "task.jsonl")
    const branchFile = path.join(sessionRoot, "branch.jsonl")
    const failingFile = path.join(sessionRoot, "registration-failure.jsonl")
    await Promise.all([
      writeFile(
        projectFile,
        sessionJsonl(
          "native-project",
          projectCwd,
          "project message",
          'Release "quoted" roadmap'
        )
      ),
      writeFile(
        taskFile,
        sessionJsonl(
          "native-task",
          taskCwd,
          "standalone needle 请务必实际调用 bash 工具 UI compact maxsim"
        )
      ),
      writeFile(branchFile, branchedSessionJsonl("native-branch", taskCwd)),
      writeFile(
        failingFile,
        `${JSON.stringify({
          type: "session",
          version: 3,
          id: "native-registration-failure",
          timestamp: "2026-07-14T00:00:00.000Z",
          cwd: failingCwd,
        })}\n{invalid json}\n`
      ),
    ])

    await syncPiSessionIndex()
    assert.deepEqual(await listWorkspaceProjects(), [])
    assert.deepEqual(await listWorkspaceTasks(), [])

    const failedRegistrations = await Promise.allSettled([
      addWorkspaceProject(failingCwd),
      addWorkspaceProject(failingCwd),
    ])
    assert.deepEqual(
      failedRegistrations.map(({ status }) => status),
      ["rejected", "rejected"]
    )
    assert.deepEqual(await listWorkspaceProjects(), [])
    assert.equal(globalThis.piWebCodexProjectRegistrations?.size, 0)
    await rm(failingFile)
    const [recoveredProject, duplicateRegistration] = await Promise.all([
      addWorkspaceProject(failingCwd),
      addWorkspaceProject(failingCwd),
    ])
    assert.equal(duplicateRegistration.id, recoveredProject.id)
    assert.equal(recoveredProject.sessionCount, 0)
    assert.equal(globalThis.piWebCodexProjectRegistrations?.size, 0)
    const database = await getDatabase()
    assert.equal(
      database
        .prepare(
          `SELECT count(*) AS count FROM project_registrations
           WHERE project_id = ?`
        )
        .get(recoveredProject.id)?.count,
      1
    )
    assert.equal(await removeWorkspaceProject(recoveredProject.id), true)

    const registered = await addWorkspaceProject(projectCwd)
    const canonicalProjectCwd = await realpath(projectCwd)
    assert.equal(registered.path, canonicalProjectCwd)
    const projectResponse = await getProjectRoute(
      new Request(`http://127.0.0.1:1816/api/v1/projects/${registered.id}`),
      { params: Promise.resolve({ projectId: registered.id }) }
    )
    assert.equal(projectResponse.status, 200)
    assert.equal(projectResponse.headers.get("cache-control"), "no-store")
    assert.deepEqual(await projectResponse.json(), registered)
    const emptyProject = await addWorkspaceProject(emptyCwd)
    assert.equal(emptyProject.sessionCount, 0)
    assert.equal(await removeWorkspaceProject(emptyProject.id), true)
    const imported = await listWorkspaceProjects()
    assert.equal(imported.length, 1)
    const projectSession = imported[0]?.sessions[0]
    const taskSession = await getSessionIdentityByNativeFile(taskFile)
    assert.ok(projectSession)
    assert.ok(taskSession)
    assert.equal(await isSessionArchived(projectSession.id), false)
    assert.equal(projectSession.hasUnreadCompletion, false)
    const projectId = projectSession.projectId
    assert.ok(projectId)

    const [titleResult] = await searchSessions('"Release" roadmap')
    assert.ok(titleResult)
    assert.equal(titleResult.sessionId, projectSession.id)
    assert.equal(titleResult.entryId, null)
    assert.equal(titleResult.entryType, "session_title")

    const branchSession = await getSessionIdentityByNativeFile(branchFile)
    assert.ok(branchSession)
    assert.deepEqual(await searchSessions("abandoned-only-needle"), [])
    const [activeResult] = await searchSessions("active-result-needle")
    assert.equal(activeResult?.sessionId, branchSession.id)
    assert.equal(activeResult?.entryId, "native-branch-result")
    const [branchTitleResult] = await searchSessions("Branch search title")
    assert.equal(branchTitleResult?.sessionId, branchSession.id)
    assert.equal(branchTitleResult?.entryId, null)
    await rm(branchFile)
    await syncPiSessionIndex()

    await appendFile(
      projectFile,
      `${JSON.stringify({
        type: "session_info",
        id: "native-project-title-updated",
        parentId: "native-project-message",
        timestamp: "2026-07-14T00:01:00.000Z",
        name: "Updated launch title",
      })}\n`
    )
    await syncPiSessionIndex()
    assert.equal(
      (await searchSessions("updated title"))[0]?.sessionId,
      projectSession.id
    )
    assert.equal((await searchSessions("release roadmap")).length, 0)

    const sessionRowsBeforeRemoval = database
      .prepare("SELECT count(*) AS count FROM sessions WHERE project_id = ?")
      .get(projectId)?.count
    const searchRowsBeforeRemoval = database
      .prepare(
        `SELECT count(*) AS count FROM session_search
         WHERE session_id = ?`
      )
      .get(projectSession.id)?.count
    assert.equal(await removeWorkspaceProject(projectId), true)
    assert.equal(await removeWorkspaceProject(projectId), false)
    assert.deepEqual(await listWorkspaceProjects(), [])
    assert.equal(await getProject(projectId), null)
    assert.equal(
      database
        .prepare("SELECT count(*) AS count FROM sessions WHERE project_id = ?")
        .get(projectId)?.count,
      sessionRowsBeforeRemoval
    )
    assert.equal(
      database
        .prepare(
          `SELECT count(*) AS count FROM session_search
           WHERE session_id = ?`
        )
        .get(projectSession.id)?.count,
      searchRowsBeforeRemoval
    )
    assert.equal((await stat(projectFile)).isFile(), true)

    await writeFile(
      projectFile,
      sessionJsonl(
        "native-project",
        projectCwd,
        "project updated while unregistered"
      )
    )
    await syncPiSessionIndex()
    assert.equal(
      (await getSessionRuntimeTarget(projectSession.id))?.projectId,
      projectId
    )
    assert.equal(
      (await searchSessions("project updated while unregistered"))[0]
        ?.sessionId,
      projectSession.id
    )
    assert.equal(
      (await searchSessions("project unregistered"))[0]?.sessionId,
      projectSession.id
    )

    const reRegistered = await addWorkspaceProject(projectCwd)
    assert.equal(reRegistered.id, projectId)
    assert.equal(
      (await listWorkspaceProjects())[0]?.sessions[0]?.id,
      projectSession.id
    )
    assert.equal(await setProjectPinned(projectId, true), true)
    assert.equal((await listWorkspaceProjects())[0]?.isPinned, true)
    assert.equal(await setSessionPinned(projectSession.id, true), true)
    assert.equal(
      (await listWorkspaceProjects())[0]?.sessions[0]?.isPinned,
      true
    )
    await setProjectPinned(projectId, false)
    await setSessionPinned(projectSession.id, false)
    assert.equal(await markSessionCompleted(projectSession.id), true)
    assert.equal(
      (await listWorkspaceProjects())[0]?.sessions[0]?.hasUnreadCompletion,
      true
    )
    assert.equal(await markSessionRead(projectSession.id), true)
    assert.equal(
      (await listWorkspaceProjects())[0]?.sessions[0]?.hasUnreadCompletion,
      false
    )

    await markSessionStandalone(taskSession.id, {
      cwd: taskCwd,
      runtimeKind: "pi-client",
      runtimeProfileId: "task-runtime",
      migratedFromSessionId: projectSession.id,
    })

    const projects = await listWorkspaceProjects()
    assert.deepEqual(
      projects.map(({ path: cwd }) => cwd),
      [canonicalProjectCwd]
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
    assert.equal(
      (await searchSessions("实际调用"))[0]?.sessionId,
      task.id,
      "trigram search should find a Chinese substring within a longer token"
    )
    const [shortChineseResult] = await searchSessions("调用")
    assert.equal(
      shortChineseResult?.sessionId,
      task.id,
      "queries shorter than a trigram should use exact substring search"
    )
    assert.match(shortChineseResult?.snippet ?? "", /【调用】/u)
    assert.equal((await searchSessions("ui"))[0]?.sessionId, task.id)
    assert.equal((await searchSessions("compact ui"))[0]?.sessionId, task.id)
    assert.deepEqual(await searchSessions("compact zz"), [])
    assert.equal(
      (await searchSessions("compact\0maxsim")).some(
        ({ sessionId }) => sessionId === task.id
      ),
      true
    )

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
    assert.deepEqual(await searchSessions("standalone updated"), [])
    assert.equal(await restoreArchivedSession(task.id), true)
    assert.equal(await isSessionArchived(task.id), false)
    assert.equal((await listWorkspaceTasks())[0]?.id, task.id)
    assert.equal(await restoreArchivedSession(task.id), false)
    assert.ok(await archiveSession(task.id))
    assert.equal(await isSessionArchived(task.id), true)
    assert.equal(await deleteArchivedSession(task.id), true)
    assert.deepEqual(await listArchivedSessions(), [])
    await assert.rejects(stat(taskFile))

    assert.equal(await setSessionPinned(projectSession.id, true), true)
    assert.equal(
      await archiveProjectSessions(projectId, [
        projectSession.id,
        projectSession.id,
        "missing-session",
      ]),
      1
    )
    assert.equal(await isSessionArchived(projectSession.id), true)
    assert.equal(
      (await listArchivedSessions()).find(
        (session) => session.id === projectSession.id
      )?.isPinned,
      false
    )
    assert.equal(
      await archiveProjectSessions(projectId, [projectSession.id]),
      0
    )

    await rm(projectCwd, { recursive: true })
    assert.deepEqual(await listWorkspaceProjects(), [])
    assert.equal((await getProject(projectId))?.path, canonicalProjectCwd)
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
})
