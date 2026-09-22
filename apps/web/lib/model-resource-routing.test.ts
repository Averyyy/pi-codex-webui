import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  addWorkspaceProject,
  bindSessionRuntime,
  getSessionIdentityByNativeFile,
} from "./catalog"
import { DEFAULT_CONFIG } from "./config-schema"
import { getDatabase } from "./database"
import { EventHub } from "./event-hub"
import { resolveModelSettingsRequestTarget } from "./model-settings-data"
import {
  RuntimeSupervisor,
  type ModelSettingsRuntimeTarget,
} from "./runtime-supervisor"

test("model context honors session and project bindings before the default", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-model-context-"))
  const previousConfig = process.env.PI_WEB_CODEX_CONFIG_DIR
  const previousSessions = process.env.PI_CODING_AGENT_SESSION_DIR
  const previousDatabase = globalThis.piWebCodexDatabase
  let database: Awaited<ReturnType<typeof getDatabase>> | undefined
  process.env.PI_WEB_CODEX_CONFIG_DIR = root
  process.env.PI_CODING_AGENT_SESSION_DIR = path.join(root, "sessions")
  globalThis.piWebCodexDatabase = undefined
  try {
    const cwd = path.join(root, "project")
    await mkdir(cwd)
    await mkdir(process.env.PI_CODING_AGENT_SESSION_DIR)
    const config = structuredClone(DEFAULT_CONFIG)
    config.developer.runtime.default = "pi-client-default"
    config.developer.runtime.profiles["pi-client-default"] = {
      kind: "pi-client",
      enabled: true,
      serverUrl: "http://127.0.0.1:4217",
      authTokenRef: null,
    }
    await writeFile(path.join(root, "config.json"), JSON.stringify(config))
    const project = await addWorkspaceProject(cwd)
    database = await getDatabase()
    database
      .prepare(
        "UPDATE projects SET default_runtime_profile_id = ? WHERE id = ?"
      )
      .run("pi", project.id)
    const projectTarget = await resolveModelSettingsRequestTarget({
      projectId: project.id,
    })
    assert.equal(projectTarget?.runtimeProfileId, "pi")
    assert.equal(projectTarget?.runtimeKind, "pi")
    const globalTarget = await resolveModelSettingsRequestTarget({})
    assert.equal(globalTarget?.cwd, projectTarget?.cwd)
    assert.equal(globalTarget?.runtimeProfileId, "pi-client-default")
    assert.equal(globalTarget?.runtimeKind, "pi-client")
    const taskTarget = await resolveModelSettingsRequestTarget({
      newTask: true,
    })
    assert.equal(taskTarget?.runtimeProfileId, "pi-client-default")
    assert.equal(taskTarget?.cwd, path.join(root, "tasks"))

    const sessionFile = path.join(root, "sessions", "fixture.jsonl")
    await writeFile(
      sessionFile,
      `${JSON.stringify({
        type: "session",
        version: 3,
        id: randomUUID(),
        timestamp: "2026-09-22T00:00:00.000Z",
        cwd,
      })}\n`
    )
    const session = await getSessionIdentityByNativeFile(sessionFile)
    assert(session)
    await bindSessionRuntime(session.id, "pi-client", "pi-client-default")
    config.developer.runtime.default = "pi"
    await writeFile(path.join(root, "config.json"), JSON.stringify(config))
    const sessionTarget = await resolveModelSettingsRequestTarget({
      sessionId: session.id,
    })
    assert.equal(sessionTarget?.cwd, projectTarget?.cwd)
    assert.equal(sessionTarget?.runtimeProfileId, "pi-client-default")
    assert.equal(sessionTarget?.runtimeKind, "pi-client")
    assert.equal(
      await resolveModelSettingsRequestTarget({ sessionId: "missing" }),
      null
    )
    await assert.rejects(
      resolveModelSettingsRequestTarget({ projectId: "missing" }),
      { code: "ProjectNotFound" }
    )
  } finally {
    database?.close()
    globalThis.piWebCodexDatabase = previousDatabase
    if (previousConfig === undefined) delete process.env.PI_WEB_CODEX_CONFIG_DIR
    else process.env.PI_WEB_CODEX_CONFIG_DIR = previousConfig
    if (previousSessions === undefined)
      delete process.env.PI_CODING_AGENT_SESSION_DIR
    else process.env.PI_CODING_AGENT_SESSION_DIR = previousSessions
    await rm(root, { recursive: true, force: true })
  }
})

test("resource workers use the bound SDK and credentials without falling back", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-resource-routing-"))
  const environment = {
    PI_WEB_CODEX_CONFIG_DIR: root,
    PI_CODING_AGENT_DIR: path.join(root, "agent"),
    PI_WEB_CODEX_PI_WORKER_PATH: path.join(root, "pi.mjs"),
    PI_WEB_CODEX_PI_CLIENT_WORKER_PATH: path.join(root, "client.mjs"),
    PI_SERVER_MODE: "inherited-mode",
    PI_SERVER_URL: "http://inherited.invalid",
    PI_SERVER_AUTH_TOKEN: "inherited-fixture-token",
  }
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]])
  )
  Object.assign(process.env, environment)
  try {
    const tokenRef = randomUUID()
    await mkdir(path.join(root, "secrets"))
    await mkdir(environment.PI_CODING_AGENT_DIR)
    await writeFile(
      path.join(root, "secrets", `${tokenRef}.secret`),
      "profile-token"
    )
    for (const [kind, filename] of [
      ["pi", environment.PI_WEB_CODEX_PI_WORKER_PATH],
      ["pi-client", environment.PI_WEB_CODEX_PI_CLIENT_WORKER_PATH],
    ] as const) {
      await writeFile(
        filename,
        `process.on("message", message => process.send({
          type: "runtime.response", requestId: message.requestId, success: true,
          data: { kind: ${JSON.stringify(kind)}, cwd: process.cwd(),
            mode: process.env.PI_SERVER_MODE ?? null,
            url: process.env.PI_SERVER_URL ?? null,
            token: process.env.PI_SERVER_AUTH_TOKEN ?? null }
        }));`
      )
    }
    const config = structuredClone(DEFAULT_CONFIG)
    config.developer.runtime.profiles["pi-client-default"] = {
      kind: "pi-client",
      enabled: true,
      serverUrl: "http://127.0.0.1:4217",
      authTokenRef: tokenRef,
    }
    const save = () =>
      writeFile(path.join(root, "config.json"), JSON.stringify(config))
    await save()
    const supervisor = new RuntimeSupervisor(new EventHub()) as unknown as {
      resourceRequest(
        message: {
          type: "models.catalog" | "resources.catalog"
          requestId: string
          payload: { cwd: string; agentDir: string }
        },
        timeoutMs: number,
        target?: ModelSettingsRuntimeTarget
      ): Promise<unknown>
    }
    let sequence = 0
    const request = (target?: ModelSettingsRuntimeTarget) =>
      supervisor.resourceRequest(
        {
          type: target ? "models.catalog" : "resources.catalog",
          requestId: `routing-${++sequence}`,
          payload: { cwd: root, agentDir: environment.PI_CODING_AGENT_DIR },
        },
        10_000,
        target
      )
    const clientTarget: ModelSettingsRuntimeTarget = {
      cwd: root,
      runtimeProfileId: "pi-client-default",
      runtimeKind: "pi-client",
    }
    assert.deepEqual(await request(clientTarget), {
      kind: "pi-client",
      cwd: root,
      mode: "true",
      url: "http://127.0.0.1:4217",
      token: "profile-token",
    })
    const piReply = {
      kind: "pi",
      cwd: root,
      mode: null,
      url: null,
      token: null,
    }
    assert.deepEqual(
      await request({ cwd: root, runtimeProfileId: "pi", runtimeKind: "pi" }),
      piReply
    )
    assert.deepEqual(await request(), piReply)
    await assert.rejects(request({ ...clientTarget, runtimeKind: "pi" }), {
      code: "RuntimeProfileMismatch",
    })
    config.developer.runtime.profiles["pi-client-default"].serverUrl = ""
    await save()
    await assert.rejects(request(clientTarget), {
      code: "RuntimeProfileIncomplete",
    })
    config.developer.runtime.profiles["pi-client-default"].enabled = false
    await save()
    await assert.rejects(request(clientTarget), {
      code: "RuntimeProfileDisabled",
    })
    await assert.rejects(
      request({ ...clientTarget, runtimeProfileId: "missing" }),
      { code: "RuntimeProfileNotFound" }
    )
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(root, { recursive: true, force: true })
  }
})
