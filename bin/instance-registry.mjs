import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

export const APP_NAME = "pi-web-codex"
export const REGISTRY_VERSION = 1
export const DEFAULT_INSTANCE_ID = "default"
export const DEFAULT_HOST = "127.0.0.1"
export const DEFAULT_PORT = 1816

const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const LOCK_RETRY_COUNT = 500
const LOCK_RETRY_DELAY_MS = 20

function userHome(env) {
  return env.USERPROFILE ?? env.HOME ?? homedir()
}

/**
 * The lifecycle registry is independent from PI_WEB_CODEX_CONFIG_DIR. The
 * latter is an instance setting; this path is the OS user's ownership
 * boundary for all managed instances.
 */
export function registryRoot(env = process.env) {
  if (process.platform === "darwin") {
    return path.join(
      env.HOME ?? userHome(env),
      "Library",
      "Application Support",
      APP_NAME
    )
  }
  if (process.platform === "win32") {
    return path.join(
      env.APPDATA ?? path.join(userHome(env), "AppData", "Roaming"),
      APP_NAME
    )
  }
  return path.join(
    env.XDG_CONFIG_HOME ?? path.join(userHome(env), ".config"),
    APP_NAME
  )
}

export function registryFile(root) {
  return path.join(root, "instances.json")
}

export function registryLockFile(root) {
  return path.join(root, "instances.lock")
}

export function registryRecoveryFile(root) {
  return `${registryLockFile(root)}.recovery`
}

export function globalUpdateLockFile(root) {
  return path.join(root, "global-update.lock")
}

export function instanceDirectory(root, id) {
  return path.join(root, "instances", validateId(id))
}

export function instanceDaemonFile(root, id) {
  return path.join(instanceDirectory(root, id), "daemon.json")
}

export function instanceConfigDirectory(root, id) {
  return path.join(instanceDirectory(root, id), "config")
}

export function instanceIdForPort(port) {
  const validPort = validatePort(port)
  return validPort === DEFAULT_PORT ? DEFAULT_INSTANCE_ID : String(validPort)
}

export function validateId(id) {
  if (typeof id !== "string" || !INSTANCE_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid ${APP_NAME} instance ID; use 1-64 lowercase letters, digits, "-", or "_".`
    )
  }
  return id
}

export function validatePort(port) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Port must be an integer between 1 and 65535.")
  }
  return port
}

function validateConfigRoot(configRoot) {
  if (typeof configRoot !== "string" || !path.isAbsolute(configRoot)) {
    throw new Error("Instance config root must be an absolute path.")
  }
  return path.resolve(configRoot)
}

function configRootKey(configRoot) {
  const value = path.resolve(configRoot)
  return process.platform === "win32" ? value.toLowerCase() : value
}

function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    defaultId: DEFAULT_INSTANCE_ID,
    instances: [],
  }
}

function validateDaemon(daemon, id) {
  if (daemon === null || daemon === undefined) return null
  if (!daemon || typeof daemon !== "object" || Array.isArray(daemon)) {
    throw new Error(`Instance ${id} has invalid daemon metadata.`)
  }
  if (!Number.isSafeInteger(daemon.pid) || daemon.pid < 1) {
    throw new Error(`Instance ${id} has invalid daemon PID metadata.`)
  }
  if (typeof daemon.controlUrl !== "string" || !daemon.controlUrl) {
    throw new Error(`Instance ${id} has invalid daemon control URL metadata.`)
  }
  let controlUrl
  try {
    controlUrl = new URL(daemon.controlUrl)
  } catch {
    throw new Error(`Instance ${id} has invalid daemon control URL metadata.`)
  }
  if (controlUrl.protocol !== "http:" || controlUrl.hostname !== DEFAULT_HOST) {
    throw new Error(`Instance ${id} has a non-loopback daemon control URL.`)
  }
  if (typeof daemon.startedAt !== "string" || !daemon.startedAt) {
    throw new Error(`Instance ${id} has invalid daemon start metadata.`)
  }
  return {
    pid: daemon.pid,
    controlUrl: daemon.controlUrl,
    startedAt: daemon.startedAt,
  }
}

export function validateDaemonState(daemon, id = "instance") {
  const value = validateDaemon(daemon, id)
  if (!value) throw new Error(`Instance ${id} daemon state is missing.`)
  if (typeof daemon.controlToken !== "string" || !daemon.controlToken) {
    throw new Error(`Instance ${id} daemon state has invalid control identity.`)
  }
  return { ...value, controlToken: daemon.controlToken }
}

function validateRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(
      "The pi-web-codex instance registry contains an invalid instance."
    )
  }
  const id = validateId(record.id)
  if (record.host !== DEFAULT_HOST) {
    throw new Error(`Instance ${id} has an unsupported host.`)
  }
  const port = validatePort(record.port)
  const configRoot = validateConfigRoot(record.configRoot)
  if (record.status !== "running" && record.status !== "stopped") {
    throw new Error(`Instance ${id} has an invalid status.`)
  }
  if (
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    throw new Error(`Instance ${id} has invalid registry timestamps.`)
  }
  const daemon = validateDaemon(record.daemon, id)
  if (record.status === "running" && !daemon) {
    throw new Error(`Running instance ${id} is missing daemon metadata.`)
  }
  if (record.status === "stopped" && daemon !== null) {
    throw new Error(`Stopped instance ${id} still has daemon metadata.`)
  }
  return {
    id,
    host: DEFAULT_HOST,
    port,
    configRoot,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    daemon,
  }
}

export function validateRegistry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The pi-web-codex instance registry is invalid.")
  }
  if (value.version !== REGISTRY_VERSION) {
    throw new Error(
      `The pi-web-codex instance registry version ${String(value.version)} is unsupported.`
    )
  }
  if (value.defaultId !== DEFAULT_INSTANCE_ID) {
    throw new Error(
      "The pi-web-codex instance registry has an invalid default instance."
    )
  }
  if (!Array.isArray(value.instances)) {
    throw new Error("The pi-web-codex instance registry has invalid instances.")
  }
  const instances = value.instances.map(validateRecord)
  const ids = new Set()
  const ports = new Set()
  const configRoots = new Set()
  for (const instance of instances) {
    if (ids.has(instance.id)) {
      throw new Error(
        `The pi-web-codex instance registry duplicates ID ${instance.id}.`
      )
    }
    if (ports.has(instance.port)) {
      throw new Error(
        `The pi-web-codex instance registry duplicates port ${instance.port}.`
      )
    }
    const configKey = configRootKey(instance.configRoot)
    if (configRoots.has(configKey)) {
      throw new Error(
        `The pi-web-codex instance registry reuses config directory ${instance.configRoot}.`
      )
    }
    ids.add(instance.id)
    ports.add(instance.port)
    configRoots.add(configKey)
  }
  return {
    version: REGISTRY_VERSION,
    defaultId: DEFAULT_INSTANCE_ID,
    instances,
  }
}

export async function readRegistry(root) {
  try {
    return validateRegistry(
      JSON.parse(await readFile(registryFile(root), "utf8"))
    )
  } catch (error) {
    if (error?.code === "ENOENT") return emptyRegistry()
    if (error instanceof SyntaxError) {
      throw new Error(
        `The pi-web-codex instance registry ${registryFile(root)} is malformed.`
      )
    }
    throw error
  }
}

async function writeRegistry(root, registry) {
  const value = validateRegistry(registry)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const target = registryFile(root)
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
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

function lockError(target, detail) {
  return new Error(
    `The ${APP_NAME} instance registry lock ${target} ${detail}. ` +
      "Refusing to overwrite it; confirm that no other pi-web-codex CLI is changing instances, then retry."
  )
}

function parseLockOwner(target, raw) {
  let owner
  try {
    owner = JSON.parse(raw)
  } catch {
    throw lockError(target, "contains malformed metadata")
  }
  if (
    !owner ||
    typeof owner !== "object" ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1 ||
    typeof owner.token !== "string" ||
    !owner.token
  ) {
    throw lockError(target, "contains invalid owner metadata")
  }
  return owner
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tryAcquireRecoveryGate(recovery, token) {
  let handle
  try {
    handle = await open(recovery, "wx", 0o600)
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })}\n`
    )
    await handle.sync()
    return { path: recovery, token, handle }
  } catch (error) {
    await handle?.close().catch(() => {})
    if (error?.code === "EEXIST") return null
    // Windows can report a sharing violation as EPERM/EACCES while another
    // contender is creating or replacing this cross-process mutex marker.
    if (
      process.platform === "win32" &&
      (error?.code === "EPERM" || error?.code === "EACCES")
    ) {
      return null
    }
    throw error
  }
}

async function acquireRecoveryGate(recovery, token) {
  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    const gate = await tryAcquireRecoveryGate(recovery, token)
    if (gate) return gate
    await delay(LOCK_RETRY_DELAY_MS)
  }
  throw lockError(
    recovery,
    "could not acquire its recovery gate before the retry limit; the recovery marker may be stale"
  )
}

async function releaseRecoveryGate(gate) {
  await gate.handle.close()

  let raw
  try {
    raw = await readFile(gate.path, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") return
    throw error
  }
  const owner = parseLockOwner(gate.path, raw)
  if (owner.token === gate.token) await rm(gate.path, { force: true })
}

/**
 * Acquire the registry lock with a recovery guard. Every target creation,
 * read, and stale-owner reclaim happens while this gate is held. Contenders
 * never inspect a partially written owner file or remove a path another
 * contender may have created.
 */
async function acquireRegistryLock(root) {
  await mkdir(root, { recursive: true, mode: 0o700 })
  const target = registryLockFile(root)
  const recovery = registryRecoveryFile(root)
  const token = randomUUID()

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    const recoveryGate = await tryAcquireRecoveryGate(recovery, token)
    if (!recoveryGate) {
      await delay(LOCK_RETRY_DELAY_MS)
      continue
    }

    let retryAfterLiveOwner = false
    let handle
    try {
      try {
        handle = await open(target, "wx", 0o600)
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })}\n`
        )
        await handle.sync()
        return { target, token, handle }
      } catch (error) {
        await handle?.close().catch(() => {})
        if (error?.code !== "EEXIST") throw error
      }

      let raw
      try {
        raw = await readFile(target, "utf8")
      } catch (error) {
        if (error?.code === "ENOENT") continue
        throw error
      }

      const owner = parseLockOwner(target, raw)
      if (processIsAlive(owner.pid)) {
        retryAfterLiveOwner = true
      } else {
        const stale = `${target}.stale-${process.pid}-${randomUUID()}`
        try {
          await rename(target, stale)
        } catch (error) {
          if (error?.code !== "ENOENT") throw error
        }
        await rm(stale, { force: true })
      }
    } finally {
      try {
        await releaseRecoveryGate(recoveryGate)
      } catch (error) {
        await handle?.close().catch(() => {})
        throw error
      }
    }

    if (retryAfterLiveOwner) await delay(LOCK_RETRY_DELAY_MS)
  }

  throw lockError(
    recovery,
    "could not acquire its recovery gate before the retry limit; the recovery marker may be stale"
  )
}

async function releaseRegistryLock(lock) {
  let closeError
  try {
    await lock.handle.close()
  } catch (error) {
    closeError = error
  }

  const recoveryGate = await acquireRecoveryGate(
    registryRecoveryFile(path.dirname(lock.target)),
    lock.token
  )

  let cleanupError = closeError
  try {
    let raw
    try {
      raw = await readFile(lock.target, "utf8")
    } catch (error) {
      if (error?.code === "ENOENT") return
      throw error
    }
    const owner = parseLockOwner(lock.target, raw)
    if (owner.token === lock.token) await rm(lock.target, { force: true })
  } catch (error) {
    cleanupError ??= error
  } finally {
    try {
      await releaseRecoveryGate(recoveryGate)
    } catch (error) {
      cleanupError ??= error
    }
  }
  if (cleanupError) throw cleanupError
}

export async function withRegistryLock(root, callback) {
  const lock = await acquireRegistryLock(root)
  try {
    return await callback()
  } finally {
    await releaseRegistryLock(lock)
  }
}

export function findInstance(registry, id) {
  validateId(id)
  return registry.instances.find((instance) => instance.id === id)
}

export function findInstanceByPort(registry, port) {
  validatePort(port)
  return registry.instances.find((instance) => instance.port === port)
}

export function makeInstance({
  id,
  port,
  configRoot,
  configDir,
  now = new Date().toISOString(),
}) {
  validateId(id)
  validatePort(port)
  return {
    id,
    host: DEFAULT_HOST,
    port,
    configRoot: validateConfigRoot(configRoot ?? configDir),
    status: "stopped",
    createdAt: now,
    updatedAt: now,
    daemon: null,
  }
}

export function setInstanceDaemon(
  instance,
  daemon,
  now = new Date().toISOString()
) {
  return validateRecord({
    ...instance,
    status: "running",
    daemon: validateDaemon(daemon, instance.id),
    updatedAt: now,
  })
}

export function clearInstanceDaemon(instance, now = new Date().toISOString()) {
  return validateRecord({
    ...instance,
    status: "stopped",
    daemon: null,
    updatedAt: now,
  })
}

export async function updateRegistry(root, updater) {
  return withRegistryLock(root, async () => {
    const current = await readRegistry(root)
    const next = validateRegistry(await updater(current))
    await writeRegistry(root, next)
    return next
  })
}

export async function persistDaemonState(root, id, daemon) {
  validateId(id)
  const value = validateDaemonState(daemon, id)
  const target = instanceDaemonFile(root, id)
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function readDaemonState(root, id) {
  validateId(id)
  try {
    return validateDaemonState(
      JSON.parse(await readFile(instanceDaemonFile(root, id), "utf8")),
      id
    )
  } catch (error) {
    if (error?.code === "ENOENT") return null
    if (error instanceof SyntaxError) {
      throw new Error(`Instance ${id} daemon metadata is malformed.`)
    }
    throw error
  }
}

export async function removeDaemonState(root, id) {
  validateId(id)
  await rm(instanceDaemonFile(root, id), { force: true })
}

export function registrySummary(registry) {
  const value = validateRegistry(registry)
  return {
    defaultInstanceId: value.defaultId,
    instances: value.instances.map(({ id, port, status, configRoot }) => ({
      id,
      port,
      status,
      configDir: configRoot,
    })),
  }
}
