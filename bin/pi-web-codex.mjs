#!/usr/bin/env node

import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { constants } from "node:fs"
import {
  access,
  mkdir,
  open as openFile,
  readFile,
  rename,
  rm,
} from "node:fs/promises"
import { createServer } from "node:net"
import { homedir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

import {
  DEFAULT_HOST,
  DEFAULT_INSTANCE_ID,
  DEFAULT_PORT,
  findInstance,
  findInstanceByPort,
  globalUpdateLockFile,
  instanceConfigDirectory,
  makeInstance,
  persistDaemonState,
  readDaemonState,
  readRegistry,
  registryRoot,
  registrySummary,
  removeDaemonState,
  setInstanceDaemon,
  clearInstanceDaemon,
  updateRegistry,
  validateId,
  validatePort,
} from "./instance-registry.mjs"
import {
  UpdateSupervisor,
  createMutationToken,
  resolveActiveRuntime,
} from "./update-supervisor.mjs"

const APP_NAME = "pi-web-codex"
const DEFAULTS = { host: DEFAULT_HOST, port: DEFAULT_PORT, openBrowser: true }
const packageRoot = fileURLToPath(new URL("..", import.meta.url))
const cliPath = fileURLToPath(import.meta.url)
const DAEMON_READY_TIMEOUT_MS = 30_000
const CONTROL_TIMEOUT_MS = 1_000
const STOP_TIMEOUT_MS = 30_000

function assertSqliteFts5() {
  const database = new DatabaseSync(":memory:")
  try {
    const row = database
      .prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled")
      .get()
    if (row.enabled !== 1) {
      throw new Error(
        `${APP_NAME} requires a Node.js build with SQLite FTS5 support. ` +
          `Node ${process.versions.node} does not provide it; use Node 22.19 or a current Node.js release with FTS5.`
      )
    }
  } finally {
    database.close()
  }
}

function configRoot(override, env = process.env) {
  if (override) return path.resolve(override)
  if (env.PI_WEB_CODEX_CONFIG_DIR) {
    return path.resolve(env.PI_WEB_CODEX_CONFIG_DIR)
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", APP_NAME)
  }
  if (process.platform === "win32") {
    return path.join(
      env.APPDATA ??
        path.join(env.USERPROFILE ?? homedir(), "AppData", "Roaming"),
      APP_NAME
    )
  }
  return path.join(
    env.XDG_CONFIG_HOME ?? path.join(env.HOME ?? homedir(), ".config"),
    APP_NAME
  )
}

function parsePort(raw, flag = "--port") {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new Error(`${flag} must be a decimal integer between 1 and 65535.`)
  }
  const port = Number(raw)
  validatePort(port)
  return port
}

function parseArguments(argv) {
  const options = { command: null, positional: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help") options.help = true
    else if (argument === "--version") options.version = true
    else if (argument === "--json") options.json = true
    else if (argument === "--open") options.openBrowser = true
    else if (argument === "--no-open") options.openBrowser = false
    else if (argument === "--daemon") options.daemon = true
    else if (
      ["--host", "--port", "--config-dir", "--instance-id"].includes(argument)
    ) {
      const value = argv[index + 1]
      if (!value) throw new Error(`${argument} requires a value.`)
      const key = argument.slice(2).replace("-dir", "Dir").replace("-id", "Id")
      options[key] = value
      index += 1
    } else if (["list", "start", "stop"].includes(argument)) {
      if (options.command)
        throw new Error("Only one CLI command may be specified.")
      options.command = argument
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown argument: ${argument}`)
    } else {
      options.positional.push(argument)
    }
  }
  if (options.command === "start" || options.command === "stop") {
    if (options.positional.length > 1) {
      throw new Error(`${options.command} accepts at most one instance ID.`)
    }
    options.instanceId = options.positional[0]
  } else if (options.positional.length > 0) {
    throw new Error(`Unexpected argument: ${options.positional[0]}`)
  }
  if (options.command === "list" && options.positional.length > 0) {
    throw new Error("list does not accept an instance ID.")
  }
  if (options.command && options.port !== undefined) {
    throw new Error(
      "--port is only valid when launching the default CLI command."
    )
  }
  if (options.command && options.configDir !== undefined) {
    throw new Error(
      "--config-dir is only valid when launching the default CLI command."
    )
  }
  if (options.command && options.host !== undefined) {
    throw new Error(
      "--host is only valid when launching the default CLI command."
    )
  }
  if (
    options.command &&
    options.command !== "start" &&
    options.openBrowser !== undefined
  ) {
    throw new Error(
      "--open and --no-open are only valid when launching or starting an instance."
    )
  }
  if (options.json && options.command !== "list") {
    throw new Error("--json is only valid with list.")
  }
  if (options.daemon && options.command) {
    throw new Error("--daemon cannot be combined with a lifecycle command.")
  }
  return options
}

async function readSettings(root) {
  try {
    const config = JSON.parse(
      await readFile(path.join(root, "config.json"), "utf8")
    )
    const host = config.server?.host
    const port = config.server?.port
    const openBrowser = config.server?.openBrowser
    if (
      host !== DEFAULT_HOST ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      typeof openBrowser !== "boolean"
    ) {
      throw new Error(
        `The settings file ${path.join(root, "config.json")} contains invalid server settings.`
      )
    }
    return { host, port, openBrowser }
  } catch (error) {
    if (error?.code === "ENOENT") return { ...DEFAULTS }
    throw error
  }
}

async function readHealth(url) {
  try {
    const response = await fetch(`${url}/api/v1/health`, {
      signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = await response.json()
    return body?.name === APP_NAME ? body : null
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      error?.name === "TimeoutError" ||
      error instanceof TypeError
    ) {
      return null
    }
    throw error
  }
}

async function assertPortAvailable(host, port) {
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(port, host, () => probe.close(resolve))
  })
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === "ESRCH") return false
    if (error?.code === "EPERM") return true
    throw error
  }
}

function lockDiagnostic(lockPath, detail) {
  return new Error(
    `Instance lock ${lockPath} contains ${detail}.\n\n` +
      `This lock records the PID of the running ${APP_NAME} instance and prevents multiple instances. ` +
      `Do not delete the config directory. Only remove this lock file after confirming that no ${APP_NAME} instance is running, then retry.`
  )
}

function lockRecoveryDiagnostic(lockPath, recoveryPath) {
  return new Error(
    `Instance lock recovery marker ${recoveryPath} already exists for ${lockPath}. ` +
      `It means another ${APP_NAME} process may be reclaiming the lock or recovery was interrupted.\n\n` +
      `Do not delete the config directory. Only remove this recovery marker after confirming that no ${APP_NAME} instance is running, then retry.`
  )
}

function validateLockOwner(lockPath, owner) {
  if (
    !owner ||
    typeof owner !== "object" ||
    Array.isArray(owner) ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1 ||
    owner.pid > 2 ** 31 - 1
  ) {
    throw lockDiagnostic(lockPath, "invalid PID metadata")
  }
  return owner
}

async function readLockOwner(lockPath) {
  try {
    return validateLockOwner(
      lockPath,
      JSON.parse(await readFile(lockPath, "utf8"))
    )
  } catch (error) {
    if (error?.code === "ENOENT") throw error
    if (error instanceof SyntaxError) {
      throw lockDiagnostic(lockPath, "empty or truncated JSON metadata")
    }
    throw error
  }
}

function activeLockError(lockPath, pid) {
  return new Error(
    `Another ${APP_NAME} instance is already running (PID ${pid}).\n\n` +
      `Instance lock: ${lockPath}\n` +
      "Do not delete or replace this lock while that process is running."
  )
}

async function createLock(lockPath) {
  const lock = await openFile(lockPath, "wx", 0o600)
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`)
    await lock.sync()
    await lock.close()
  } catch (error) {
    await lock.close().catch(() => {})
    throw error
  }
  return lockPath
}

async function acquireInstanceLock(root) {
  const lockDirectory = path.join(root, "locks")
  const lockPath = path.join(lockDirectory, "instance.lock")
  const recoveryPath = `${lockPath}.recovery`
  await mkdir(lockDirectory, { recursive: true, mode: 0o700 })

  for (;;) {
    try {
      await mkdir(recoveryPath, { mode: 0o700 })
    } catch (error) {
      if (error?.code === "EEXIST")
        throw lockRecoveryDiagnostic(lockPath, recoveryPath)
      throw error
    }
    try {
      try {
        return await createLock(lockPath)
      } catch (error) {
        if (error?.code !== "EEXIST") throw error
      }
      let owner
      try {
        owner = await readLockOwner(lockPath)
      } catch (error) {
        if (error?.code === "ENOENT") continue
        throw error
      }
      if (processIsAlive(owner.pid)) throw activeLockError(lockPath, owner.pid)
      const stalePath = `${lockPath}.stale-${process.pid}-${randomUUID()}`
      try {
        await rename(lockPath, stalePath)
      } catch (error) {
        if (error?.code === "ENOENT") continue
        throw error
      }
      await rm(stalePath, { force: true })
    } finally {
      await rm(recoveryPath, { recursive: true, force: true })
    }
  }
}

function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]
  const launcher = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    shell: false,
  })
  launcher.once("error", (error) =>
    console.error(`Could not open browser: ${error.message}`)
  )
  launcher.unref()
}

function announceReady(url, extra = {}) {
  console.log(`${APP_NAME} is ready at ${url}`)
  if (typeof process.send === "function" && process.connected) {
    try {
      process.send({ type: "ready", url, ...extra })
    } catch {
      // The launcher may disconnect immediately after receiving readiness.
    }
  }
}

function announceError(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (typeof process.send === "function" && process.connected) {
    try {
      process.send({ type: "error", message })
    } catch {
      // The launcher may have already observed a process error.
    }
  }
  console.error(message)
}

function pathKey(value) {
  const resolved = path.resolve(value)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

async function ensureNoUpdateLease(root) {
  const leasePath = globalUpdateLockFile(root)
  let raw
  try {
    raw = await readFile(leasePath, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
  let owner
  try {
    owner = JSON.parse(raw)
  } catch {
    throw new Error(
      `Shared global update lease ${leasePath} is malformed; refusing instance startup.`
    )
  }
  if (
    !owner ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1 ||
    typeof owner.token !== "string"
  ) {
    throw new Error(
      `Shared global update lease ${leasePath} has invalid owner metadata.`
    )
  }
  if (processIsAlive(owner.pid)) {
    throw new Error(
      `Instance startup is refused while managed update ${owner.instanceId ?? "unknown"} is mutating the shared global installation.`
    )
  }
  const stale = `${leasePath}.stale-${process.pid}-${randomUUID()}`
  await rename(leasePath, stale)
  await rm(stale, { force: true })
}

async function ensureInstanceRecord({
  root,
  id,
  port,
  configDir,
  configDirProvided,
}) {
  const normalizedConfigDir = path.resolve(configDir)
  const next = await updateRegistry(root, (registry) => {
    // Registration is serialized with update lease creation. A stale lease
    // is recovered only after its recorded owner is proven dead.
    return ensureNoUpdateLease(root).then(() => {
      const byId = findInstance(registry, id)
      const byPort = findInstanceByPort(registry, port)
      if (byPort && byPort.id !== id) {
        throw new Error(
          `Port ${port} is already assigned to managed instance ${byPort.id}; choose another port.`
        )
      }
      if (byId) {
        if (
          configDirProvided &&
          pathKey(byId.configRoot) !== pathKey(normalizedConfigDir)
        ) {
          throw new Error(
            `Instance ${id} is already bound to config directory ${byId.configRoot}; refusing to replace its durable settings.`
          )
        }
        if (byId.status === "running" && byId.port !== port) {
          throw new Error(
            `Instance ${id} is running on port ${byId.port}; stop it before changing its port.`
          )
        }
        if (byId.port === port) return registry
        return {
          ...registry,
          instances: registry.instances.map((instance) =>
            instance.id === id
              ? { ...instance, port, updatedAt: new Date().toISOString() }
              : instance
          ),
        }
      }
      return {
        ...registry,
        instances: [
          ...registry.instances,
          makeInstance({ id, port, configRoot: normalizedConfigDir }),
        ],
      }
    })
  })
  return findInstance(next, id)
}

async function cleanupRegistryRecord(root, id, pid) {
  const state = await readDaemonState(root, id)
  if (state && state.pid === pid) await removeDaemonState(root, id)
  await updateRegistry(root, (registry) => {
    const instance = findInstance(registry, id)
    if (!instance || instance.status !== "running") return registry
    if (instance.daemon?.pid !== pid) return registry
    return {
      ...registry,
      instances: registry.instances.map((item) =>
        item.id === id ? clearInstanceDaemon(item) : item
      ),
    }
  })
}

async function requestControl(state, endpoint, method = "GET") {
  const controlUrl = new URL(state.controlUrl)
  if (controlUrl.protocol !== "http:" || controlUrl.hostname !== DEFAULT_HOST) {
    throw new Error(
      "Daemon control metadata is not loopback HTTP; refusing the request."
    )
  }
  const response = await fetch(`${controlUrl.origin}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${state.controlToken}` },
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  })
  let body = null
  try {
    body = await response.json()
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  return { response, body }
}

function assertIdentity(body, instance, state) {
  if (
    !body ||
    body.name !== APP_NAME ||
    body.instanceId !== instance.id ||
    body.pid !== state.pid ||
    body.port !== instance.port ||
    pathKey(body.configRoot) !== pathKey(instance.configRoot) ||
    typeof body.controlUrl !== "string" ||
    body.status !== "running"
  ) {
    throw new Error(
      `Instance ${instance.id} returned an identity that does not match its durable daemon record.`
    )
  }
  const descriptor = new URL(body.controlUrl)
  if (descriptor.protocol !== "http:" || descriptor.hostname !== DEFAULT_HOST) {
    throw new Error(
      `Instance ${instance.id} returned a non-loopback control descriptor.`
    )
  }
  return body
}

async function assertLiveIdentity(instance, state) {
  const result = await requestControl(state, "/identity")
  if (!result.response.ok) {
    throw new Error(
      `Instance ${instance.id} identity control returned HTTP ${result.response.status}.`
    )
  }
  return assertIdentity(result.body, instance, state)
}

async function waitForExit(pid, url, timeoutMs = STOP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const alive = processIsAlive(pid)
    const health = await readHealth(url)
    if (!alive && !health) return
    if (Date.now() >= deadline) {
      throw new Error(
        `The ${APP_NAME} daemon PID ${pid} did not stop before the timeout; it was not terminated by PID.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function stopInstance(root, id, explicit) {
  validateId(id)
  const registry = await readRegistry(root)
  const instance = findInstance(registry, id)
  if (!instance) {
    if (!explicit && id === DEFAULT_INSTANCE_ID) return false
    throw new Error(`Managed instance ${id} does not exist.`)
  }
  if (instance.status === "stopped") {
    const stale = await readDaemonState(root, id)
    if (stale) {
      if (processIsAlive(stale.pid)) {
        throw new Error(
          `Instance ${id} is marked stopped but daemon PID ${stale.pid} is alive; refusing to guess its identity.`
        )
      }
      await removeDaemonState(root, id)
    }
    return false
  }
  const state = await readDaemonState(root, id)
  if (!state)
    throw new Error(`Running instance ${id} has no authenticated daemon state.`)
  await assertLiveIdentity(instance, state)
  let result
  try {
    result = await requestControl(state, "/shutdown", "POST")
  } catch (error) {
    if (
      !processIsAlive(state.pid) &&
      !(await readHealth(`http://${instance.host}:${instance.port}`))
    ) {
      await cleanupRegistryRecord(root, id, state.pid)
      return true
    }
    throw new Error(
      `Could not contact instance ${id} shutdown control: ${error.message}`
    )
  }
  if (result.response.status === 409) {
    throw new Error(
      typeof result.body?.error === "string"
        ? result.body.error
        : `Instance ${id} refused shutdown while an update is active.`
    )
  }
  if (!result.response.ok) {
    throw new Error(
      `Instance ${id} shutdown control returned HTTP ${result.response.status}.`
    )
  }
  await waitForExit(state.pid, `http://${instance.host}:${instance.port}`)
  await cleanupRegistryRecord(root, id, state.pid)
  return true
}

async function spawnTreeCleanup(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1 || !processIsAlive(pid)) return
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `taskkill /PID ${pid} /T /F`],
        { stdio: "ignore", windowsHide: true, shell: false }
      )
      child.once("error", reject)
      child.once("close", (code) =>
        code === 0 || !processIsAlive(pid)
          ? resolve()
          : reject(new Error(`taskkill could not terminate daemon PID ${pid}.`))
      )
    })
    return
  }
  try {
    process.kill(pid, "SIGTERM")
  } catch (error) {
    if (error?.code !== "ESRCH") throw error
  }
}

function validateReadyMessage(message, expectedUrl) {
  if (!message || message.type !== "ready") {
    throw new Error("Daemon did not send a readiness acknowledgement.")
  }
  if (message.url !== expectedUrl) {
    throw new Error(`Daemon reported unexpected URL ${String(message.url)}.`)
  }
  if (
    typeof message.controlUrl !== "string" ||
    typeof message.controlToken !== "string"
  ) {
    throw new Error(
      "Daemon readiness acknowledgement omitted authenticated control state."
    )
  }
  const control = new URL(message.controlUrl)
  if (control.protocol !== "http:" || control.hostname !== "127.0.0.1") {
    throw new Error(
      "Daemon readiness acknowledgement used a non-loopback control URL."
    )
  }
  return message
}

async function waitForDaemonReady(child, expectedUrl, logPath) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(
      () =>
        finishReject(
          new Error(`Timed out waiting for the daemon; inspect ${logPath}.`)
        ),
      DAEMON_READY_TIMEOUT_MS
    )
    timeout.unref?.()
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.off("message", onMessage)
      child.off("error", onError)
      child.off("exit", onExit)
      callback()
    }
    const finishReject = (error) => finish(() => reject(error))
    const onMessage = (message) => {
      try {
        if (message?.type === "error") {
          throw new Error(
            typeof message.message === "string"
              ? `Daemon failed during startup: ${message.message}`
              : "Daemon failed during startup without a diagnostic."
          )
        }
        const ready = validateReadyMessage(message, expectedUrl)
        finish(() => resolve(ready))
      } catch (error) {
        finishReject(error)
      }
    }
    const onError = (error) => finishReject(error)
    const onExit = (code, signal) =>
      finishReject(
        new Error(
          `Daemon exited before readiness (${signal ?? code ?? "unknown"}); inspect ${logPath}.`
        )
      )
    child.on("message", onMessage)
    child.once("error", onError)
    child.once("exit", onExit)
  })
}

async function startInstance(root, instance, { open = false } = {}) {
  await updateRegistry(root, async (registry) => {
    await ensureNoUpdateLease(root)
    return registry
  })
  const url = `http://${instance.host}:${instance.port}`
  const activeRuntime = await resolveActiveRuntime(
    instance.configRoot,
    packageRoot
  )
  let existingState = null
  if (instance.status === "running") {
    existingState = await readDaemonState(root, instance.id)
    if (!existingState)
      throw new Error(
        `Running instance ${instance.id} has no authenticated daemon state.`
      )
    const health = await readHealth(url)
    if (health) {
      if (health.version !== activeRuntime.version) {
        throw new Error(
          `Instance ${instance.id} reports version ${health.version ?? "unknown"}, but this CLI is ${activeRuntime.version}; stop it before starting a different runtime.`
        )
      }
      await assertLiveIdentity(instance, existingState)
      if (open) openBrowser(url)
      return url
    }
    if (processIsAlive(existingState.pid)) {
      throw new Error(
        `Instance ${instance.id} is registered as running (PID ${existingState.pid}) but its health endpoint is unavailable.`
      )
    }
    await cleanupRegistryRecord(root, instance.id, existingState.pid)
    instance = { ...instance, status: "stopped", daemon: null }
  } else {
    const stale = await readDaemonState(root, instance.id)
    if (stale) {
      if (processIsAlive(stale.pid)) {
        throw new Error(
          `Instance ${instance.id} is marked stopped but daemon PID ${stale.pid} is alive; refusing to adopt it.`
        )
      }
      await removeDaemonState(root, instance.id)
    }
  }

  try {
    await assertPortAvailable(instance.host, instance.port)
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      throw new Error(
        `Port ${instance.port} is already in use by an unregistered service; refusing to guess its identity.`
      )
    }
    throw error
  }

  assertSqliteFts5()
  const logDir = path.join(instance.configRoot, "logs")
  const logPath = path.join(logDir, "daemon.log")
  await mkdir(logDir, { recursive: true, mode: 0o700 })
  const log = await openFile(logPath, "a")
  const childEnv = {
    ...process.env,
    PI_WEB_CODEX_CONFIG_DIR: path.resolve(instance.configRoot),
    PI_WEB_CODEX_INSTANCE_PORT: String(instance.port),
    PI_WEB_CODEX_INSTANCE_ID: instance.id,
    PI_WEB_CODEX_REGISTRY_ROOT: path.resolve(root),
  }
  let child
  try {
    child = spawn(
      process.execPath,
      [
        cliPath,
        "--daemon",
        "--instance-id",
        instance.id,
        "--host",
        instance.host,
        "--port",
        String(instance.port),
        "--config-dir",
        path.resolve(instance.configRoot),
        "--no-open",
      ],
      {
        cwd: packageRoot,
        env: childEnv,
        detached: true,
        windowsHide: true,
        shell: false,
        stdio: ["ignore", log.fd, log.fd, "ipc"],
      }
    )
  } finally {
    await log.close()
  }
  try {
    const ready = await waitForDaemonReady(child, url, logPath)
    const registeredState = await readDaemonState(root, instance.id)
    const registered = findInstance(await readRegistry(root), instance.id)
    if (
      !registeredState ||
      !registered ||
      registered.status !== "running" ||
      registeredState.pid !== child.pid ||
      registeredState.controlUrl !== ready.controlUrl ||
      registeredState.controlToken !== ready.controlToken
    ) {
      throw new Error(
        `Daemon ${instance.id} acknowledged readiness without a matching durable registry state.`
      )
    }
    child.disconnect?.()
    child.unref()
    if (open) openBrowser(url)
    return url
  } catch (error) {
    await spawnTreeCleanup(child.pid).catch(() => {})
    throw error
  }
}

async function listInstances(root) {
  let registry = await readRegistry(root)
  for (const instance of registry.instances) {
    if (instance.status !== "running") continue
    const state = await readDaemonState(root, instance.id)
    if (!state)
      throw new Error(
        `Running instance ${instance.id} has no authenticated daemon state.`
      )
    const identity = await requestControl(state, "/identity").catch(() => null)
    const health = await readHealth(`http://${instance.host}:${instance.port}`)
    if (identity?.response?.ok) {
      assertIdentity(identity.body, instance, state)
    } else if (identity) {
      throw new Error(
        `Instance ${instance.id} identity control returned HTTP ${identity.response.status}; refusing to infer lifecycle state.`
      )
    } else if (!health && !processIsAlive(state.pid)) {
      await cleanupRegistryRecord(root, instance.id, state.pid)
    } else if (health) {
      throw new Error(
        `Instance ${instance.id} identity control is unavailable while its port serves ${APP_NAME}; refusing to guess ownership.`
      )
    } else {
      throw new Error(
        `Instance ${instance.id} identity control is unavailable while daemon PID ${state.pid} is alive.`
      )
    }
  }
  registry = await readRegistry(root)
  return registrySummary(registry)
}

async function resolveLaunchInstance(root, options) {
  const existing = await readRegistry(root)
  const defaultInstance = findInstance(existing, DEFAULT_INSTANCE_ID)
  const explicitPort = options.port !== undefined
  let id
  let port
  let configDir
  let configDirProvided = options.configDir !== undefined
  if (explicitPort) {
    port = parsePort(options.port)
    const legacyConfigDir = configRoot(options.configDir)
    const legacySettings = await readSettings(legacyConfigDir)
    const matchesLegacyDefault =
      !defaultInstance && legacySettings.port === port
    id =
      defaultInstance?.port === port ||
      matchesLegacyDefault ||
      (port === DEFAULT_PORT &&
        !defaultInstance &&
        legacySettings.port === DEFAULT_PORT)
        ? DEFAULT_INSTANCE_ID
        : String(port)
    const byId = findInstance(existing, id)
    configDir = options.configDir
      ? path.resolve(options.configDir)
      : (byId?.configRoot ??
        (id === DEFAULT_INSTANCE_ID
          ? legacyConfigDir
          : instanceConfigDirectory(root, id)))
  } else if (defaultInstance) {
    id = defaultInstance.id
    port = defaultInstance.port
    configDir = defaultInstance.configRoot
    if (
      options.configDir &&
      pathKey(options.configDir) !== pathKey(configDir)
    ) {
      throw new Error(
        `The default instance is already bound to config directory ${configDir}.`
      )
    }
    configDirProvided = false
  } else {
    id = DEFAULT_INSTANCE_ID
    configDir = configRoot(options.configDir)
    const settings = await readSettings(configDir)
    port = settings.port
  }
  const settings = await readSettings(configDir)
  if (options.host && options.host !== DEFAULT_HOST) {
    throw new Error(
      "Only 127.0.0.1 is allowed until LAN authentication is implemented."
    )
  }
  const instance = await ensureInstanceRecord({
    root,
    id,
    port,
    configDir,
    configDirProvided,
  })
  return { instance, open: options.openBrowser ?? settings.openBrowser }
}

async function runDaemon(options) {
  if (!options.instanceId)
    throw new Error("Daemon mode requires --instance-id.")
  const id = validateId(options.instanceId)
  const port = parsePort(options.port)
  const root = path.resolve(
    process.env.PI_WEB_CODEX_REGISTRY_ROOT ?? registryRoot(process.env)
  )
  const configDir = path.resolve(
    options.configDir ?? process.env.PI_WEB_CODEX_CONFIG_DIR ?? configRoot()
  )
  const registry = await readRegistry(root)
  const instance = findInstance(registry, id)
  if (!instance) throw new Error(`Managed instance ${id} is not registered.`)
  if (
    instance.port !== port ||
    pathKey(instance.configRoot) !== pathKey(configDir)
  ) {
    throw new Error(
      `Managed instance ${id} startup parameters do not match its durable registry record.`
    )
  }
  const runtime = await resolveActiveRuntime(configDir, packageRoot)
  const packageVersion = runtime.version
  assertSqliteFts5()
  const url = `http://${DEFAULT_HOST}:${port}`
  const existingHealth = await readHealth(url)
  if (existingHealth) {
    throw new Error(
      `Port ${port} already serves ${APP_NAME}; refusing to adopt an unowned process.`
    )
  }
  try {
    await assertPortAvailable(DEFAULT_HOST, port)
  } catch (error) {
    if (error?.code === "EADDRINUSE")
      throw new Error(`Port ${port} is already in use.`)
    throw error
  }
  await access(runtime.serverPath, constants.R_OK)
  const lockPath = await acquireInstanceLock(configDir)
  const mutationToken = await createMutationToken(configDir)
  const supervisor = new UpdateSupervisor({
    configRoot: configDir,
    runtimeRoot: runtime.root,
    globalRoot: runtime.root,
    version: packageVersion,
    host: DEFAULT_HOST,
    port,
    mutationToken,
    registryRoot: root,
    instanceId: id,
  })
  const signalHandlers = new Map()
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      void supervisor.shutdown(signal).catch((error) => {
        console.error(`Could not shut down instance ${id}: ${error.message}`)
      })
    }
    signalHandlers.set(signal, handler)
    process.once(signal, handler)
  }
  try {
    supervisor.runtimeStarting = true
    await supervisor.startControlServer()
    const daemon = {
      pid: process.pid,
      controlUrl: supervisor.controlUrl,
      controlToken: supervisor.controlToken,
      startedAt: new Date().toISOString(),
    }
    await persistDaemonState(root, id, daemon)
    await updateRegistry(root, async (current) => {
      await ensureNoUpdateLease(root)
      const registered = findInstance(current, id)
      if (!registered) {
        throw new Error(
          `Managed instance ${id} disappeared before daemon registration.`
        )
      }
      if (registered.status === "running") {
        throw new Error(
          `Managed instance ${id} is already registered as running.`
        )
      }
      return {
        ...current,
        instances: current.instances.map((item) =>
          item.id === id ? setInstanceDaemon(item, daemon) : item
        ),
      }
    })
    await supervisor.startRuntime(runtime.root, packageVersion, false)
    supervisor.runtimeStarting = false
    announceReady(url, {
      controlUrl: supervisor.controlUrl,
      controlToken: supervisor.controlToken,
      startedAt: daemon.startedAt,
    })
    const result = await supervisor.waitForTermination()
    process.exitCode = result.error ? 1 : (result.code ?? 0)
  } finally {
    for (const [signal, handler] of signalHandlers)
      process.removeListener(signal, handler)
    supervisor.runtimeStarting = false
    if (!supervisor.terminationResult)
      await supervisor.shutdown("SIGTERM").catch(() => {})
    await supervisor.closeControlServer().catch(() => {})
    await rm(lockPath, { force: true })
    await cleanupRegistryRecord(root, id, process.pid).catch((error) => {
      console.error(
        `Could not clean up instance ${id} registry state: ${error.message}`
      )
      process.exitCode = 1
    })
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log(
      `Usage: ${APP_NAME} [options]\n\n` +
        "Commands:\n" +
        "  (no command)          Start the default instance in the background\n" +
        "  --port <port>         Create or resume a persistent port-bound instance\n" +
        "  list [--json]         List managed instances\n" +
        "  start <id>            Resume a stopped instance\n" +
        "  stop [id]             Stop an instance (bare stop targets default)\n\n" +
        "Options:\n" +
        "  --config-dir <path>   Use an absolute instance settings directory\n" +
        "  --host <host>         Bind loopback host 127.0.0.1\n" +
        "  --open / --no-open    Open or suppress the browser\n" +
        "  --version             Print the installed package version\n" +
        "  --help                Show this help\n\n" +
        `Examples:\n  ${APP_NAME}\n  ${APP_NAME} --port 1820\n  ${APP_NAME} list --json\n  ${APP_NAME} start 1820\n  ${APP_NAME} stop`
    )
    return
  }
  const runtime = await resolveActiveRuntime(
    configRoot(options.configDir),
    packageRoot
  )
  if (options.version) {
    console.log(runtime.version)
    return
  }
  const root = registryRoot(process.env)
  if (options.daemon) {
    await runDaemon(options)
    return
  }
  if (options.command === "list") {
    const result = await listInstances(root)
    if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`)
    else {
      for (const instance of result.instances) {
        console.log(
          `${instance.id}\t${instance.port}\t${instance.status}\t${instance.configDir}`
        )
      }
    }
    return
  }
  if (options.command === "stop") {
    const id = options.instanceId ?? DEFAULT_INSTANCE_ID
    const stopped = await stopInstance(
      root,
      id,
      options.instanceId !== undefined
    )
    if (stopped) console.log(`Stopped ${APP_NAME} instance ${id}.`)
    else console.log(`Instance ${id} is already stopped.`)
    return
  }
  if (options.command === "start") {
    if (!options.instanceId) throw new Error("start requires an instance ID.")
    const id = validateId(options.instanceId)
    const registry = await readRegistry(root)
    const instance = findInstance(registry, id)
    if (!instance) throw new Error(`Managed instance ${id} does not exist.`)
    const settings = await readSettings(instance.configRoot)
    const url = await startInstance(root, instance, {
      open: options.openBrowser ?? settings.openBrowser,
    })
    announceReady(url)
    return
  }
  const launch = await resolveLaunchInstance(root, options)
  const url = await startInstance(root, launch.instance, { open: launch.open })
  announceReady(url)
}

main().catch((error) => {
  announceError(error)
  process.exitCode = 1
})
