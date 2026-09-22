import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { access, open, readFile, rename, rm } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import {
  APP_NAME,
  OFFICIAL_REGISTRY,
  compareSemver,
  createMutationToken,
  isStableVersion,
  resolveCanonicalGlobal,
  runNpmCommand,
  verifyInstalledRuntime,
} from "./update-supervisor.mjs"
import {
  DEFAULT_INSTANCE_ID,
  findInstance,
  globalUpdateLockFile,
  readDaemonState,
  readRegistry,
  registryRoot,
  withRegistryLock,
} from "./instance-registry.mjs"

export const DEFAULT_HOST = "127.0.0.1"
export const DEFAULT_PORT = 1816
export const RUNNING_UPDATE_TIMEOUT_MS = 30 * 60 * 1000
export const RUNNING_UPDATE_POLL_MS = 1_000
export const CONTROL_REQUEST_TIMEOUT_MS = 10_000

function toError(error) {
  return error instanceof Error ? error : new Error(String(error))
}

function pathKey(value) {
  const resolved = path.resolve(value)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

export function configRoot(env = process.env) {
  if (env.PI_WEB_CODEX_CONFIG_DIR) {
    return path.resolve(env.PI_WEB_CODEX_CONFIG_DIR)
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", APP_NAME)
  }
  if (process.platform === "win32") {
    return path.join(
      env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      APP_NAME
    )
  }
  return path.join(
    env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    APP_NAME
  )
}

export async function packageVersion(packageRoot) {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  )
  if (manifest.name !== APP_NAME) {
    throw new Error(
      `The Pi extension package is ${String(manifest.name)}, expected ${APP_NAME}.`
    )
  }
  if (!isStableVersion(manifest.version)) {
    throw new Error(
      `The Pi extension package version must be a stable full semantic version, received ${String(manifest.version)}.`
    )
  }
  return manifest.version
}

export async function serverSettings(root) {
  try {
    const config = JSON.parse(
      await readFile(path.join(root, "config.json"), "utf8")
    )
    const host = config.server?.host
    const port = config.server?.port
    if (
      host !== DEFAULT_HOST ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65_535
    ) {
      throw new Error(
        `The WebUI server settings in ${path.join(root, "config.json")} are invalid.`
      )
    }
    return { host, port }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { host: DEFAULT_HOST, port: DEFAULT_PORT }
    }
    throw error
  }
}

function updateUrl(settings) {
  return `http://${settings.host}:${settings.port}`
}

async function readHealth(fetchImpl, url) {
  try {
    const response = await fetchImpl(`${url}/api/v1/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(500),
    })
    if (!response.ok) return null
    const body = await response.json()
    if (body?.name !== APP_NAME || typeof body.version !== "string") {
      return null
    }
    return body
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

export async function readLiveInstanceLock(root) {
  const lockPath = path.join(root, "locks", "instance.lock")
  let raw
  try {
    raw = await readFile(lockPath, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
  let owner
  try {
    owner = JSON.parse(raw)
  } catch {
    throw new Error(
      `The ${APP_NAME} instance lock ${lockPath} is malformed; refusing to modify the global installation.`
    )
  }
  if (
    !owner ||
    typeof owner !== "object" ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1
  ) {
    throw new Error(
      `The ${APP_NAME} instance lock ${lockPath} has invalid PID metadata; refusing to modify the global installation.`
    )
  }
  return processIsAlive(owner.pid) ? { lockPath, pid: owner.pid } : null
}

async function readGlobalRuntime(globalPackageRoot, verifyRuntime) {
  try {
    return await verifyRuntime(globalPackageRoot)
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

const UPDATE_PHASES = new Set([
  "idle",
  "checking",
  "installing",
  "restarting",
  "succeeded",
  "failed",
])

function isUpdateStatus(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.supported === "boolean" &&
    typeof value.currentVersion === "string" &&
    (value.latestVersion === null || typeof value.latestVersion === "string") &&
    typeof value.available === "boolean" &&
    UPDATE_PHASES.has(value.phase) &&
    (value.error === null || typeof value.error === "string") &&
    (value.operationId === null || typeof value.operationId === "string")
  )
}

async function fetchWithTimeout(
  fetchImpl,
  url,
  options = {},
  timeoutMs = CONTROL_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function readUpdateStatus(
  fetchImpl,
  url,
  { timeoutMs = CONTROL_REQUEST_TIMEOUT_MS } = {}
) {
  let response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      `${url}/api/v1/update`,
      { cache: "no-store", headers: { Accept: "application/json" } },
      timeoutMs
    )
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
  const body = await readResponseBody(response)
  if (!response.ok) {
    if (response.status >= 500) return null
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `The running ${APP_NAME} update API returned HTTP ${response.status}.`
    )
  }
  if (!isUpdateStatus(body)) {
    throw new Error(
      `The running ${APP_NAME} returned an invalid update status; refusing to assume its installation identity.`
    )
  }
  return body
}

export async function ensureCanonicalGlobal({
  packageRoot,
  version,
  env = process.env,
  spawnImpl = spawn,
  resolveGlobal = resolveCanonicalGlobal,
  npmCommand = runNpmCommand,
  verifyRuntime = verifyInstalledRuntime,
  resolvedGlobal = null,
  existingRuntime = undefined,
} = {}) {
  if (!packageRoot || !version) {
    throw new Error("The extension package root and version are required.")
  }
  const global =
    resolvedGlobal ?? (await resolveGlobal({ env, spawnImpl, npmCommand }))
  const existing =
    existingRuntime === undefined
      ? await readGlobalRuntime(global.packageRoot, verifyRuntime)
      : existingRuntime
  if (existing && compareSemver(existing.version, version) >= 0) {
    return { ...global, ...existing, installed: false }
  }

  await npmCommand(
    [
      "install",
      "--global",
      "--prefix",
      global.prefix,
      "--force",
      "--ignore-scripts",
      "--omit=peer",
      "--no-audit",
      "--no-fund",
      "--registry",
      OFFICIAL_REGISTRY,
      `${APP_NAME}@${version}`,
    ],
    {
      cwd: packageRoot,
      env: { ...env, npm_config_registry: OFFICIAL_REGISTRY },
    },
    spawnImpl
  )
  const installed = await verifyRuntime(global.packageRoot, version)
  return { ...global, ...installed, installed: true }
}

async function readResponseBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function legacyUpdateError(url, detail) {
  return new Error(
    `The running ${APP_NAME} at ${url} cannot perform a coordinated update. ` +
      `${detail} The running service was left untouched.`
  )
}

async function updateRunningServer({
  configRootPath,
  url,
  targetVersion,
  fetchImpl,
  timeoutMs = RUNNING_UPDATE_TIMEOUT_MS,
  pollMs = RUNNING_UPDATE_POLL_MS,
  requestTimeoutMs = CONTROL_REQUEST_TIMEOUT_MS,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const token = await createMutationToken(configRootPath)
  let response
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      `${url}/api/v1/update`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Host: new URL(url).host,
          Origin: url,
          "X-Pi-Web-Codex-Mutation-Token": token,
        },
        body: JSON.stringify({ version: targetVersion }),
      },
      requestTimeoutMs
    )
  } catch (error) {
    throw legacyUpdateError(
      url,
      `The update request could not reach the service: ${toError(error).message}`
    )
  }
  const body = await readResponseBody(response)
  if (response.status === 404) {
    throw legacyUpdateError(url, "Its update API is unavailable.")
  }
  if (response.status === 403) {
    throw legacyUpdateError(
      url,
      "Its mutation token did not match this Pi WebUI configuration; set PI_WEB_CODEX_CONFIG_DIR to the running instance's config directory and retry."
    )
  }
  if (!response.ok && response.status !== 409) {
    throw legacyUpdateError(
      url,
      typeof body?.error === "string"
        ? body.error
        : `The update API returned HTTP ${response.status}.`
    )
  }
  if (!isUpdateStatus(body)) {
    throw legacyUpdateError(
      url,
      "Its update API did not return a verifiable operation status."
    )
  }
  if (
    body.phase === "failed" ||
    (body.latestVersion !== null && body.latestVersion !== targetVersion)
  ) {
    throw legacyUpdateError(
      url,
      body.error ?? "The update API rejected the requested version."
    )
  }
  if (
    response.status === 409 &&
    !(
      body.latestVersion === targetVersion &&
      (body.phase === "installing" || body.phase === "restarting") &&
      body.operationId !== null
    )
  ) {
    throw legacyUpdateError(
      url,
      typeof body?.error === "string"
        ? body.error
        : "Another update is already in progress for a different version."
    )
  }

  const deadline = Date.now() + timeoutMs
  const operationId = body.operationId
  let status = body
  for (;;) {
    const nextStatus = await readUpdateStatus(fetchImpl, url, {
      timeoutMs: requestTimeoutMs,
    })
    if (nextStatus) status = nextStatus
    if (status.phase === "failed") {
      throw new Error(
        `The running ${APP_NAME} update failed: ${status.error ?? "unknown update error"}.`
      )
    }
    if (
      operationId !== null &&
      status.operationId !== null &&
      status.operationId !== operationId
    ) {
      throw new Error(
        `The running ${APP_NAME} update operation changed unexpectedly. Check the WebUI update status before retrying.`
      )
    }
    const health = await readHealth(fetchImpl, url)
    if (
      status.phase === "succeeded" &&
      status.currentVersion === targetVersion &&
      health?.version === targetVersion
    ) {
      return health
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `The running ${APP_NAME} did not restart at version ${targetVersion} before the timeout. Check the WebUI update status before retrying.`
      )
    }
    await sleep(pollMs)
  }
}

async function acquireGlobalMutationLease(root, instanceId) {
  const lockPath = globalUpdateLockFile(root)
  const token = randomUUID()
  await withRegistryLock(root, async () => {
    const registry = await readRegistry(root)
    const running = registry.instances.filter(
      (instance) =>
        instance.status === "running" &&
        (!instanceId || instance.id !== instanceId)
    )
    if (running.length > 0) {
      throw new Error(
        `Shared global installation mutation is refused while managed instance(s) ${running
          .map((instance) => instance.id)
          .join(", ")} are running.`
      )
    }
    let handle
    try {
      handle = await open(lockPath, "wx", 0o600)
    } catch (error) {
      if (error?.code !== "EEXIST") throw error
      let owner
      try {
        owner = JSON.parse(await readFile(lockPath, "utf8"))
      } catch (readError) {
        if (readError?.code === "ENOENT") {
          throw new Error(
            `Shared global update lease ${lockPath} changed during acquisition; retry.`
          )
        }
        throw new Error(
          `Shared global update lease ${lockPath} is malformed; refusing concurrent package mutation.`
        )
      }
      if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid < 1) {
        throw new Error(
          `Shared global update lease ${lockPath} has invalid owner metadata.`
        )
      }
      try {
        process.kill(owner.pid, 0)
        throw new Error(
          `Another managed update owns ${lockPath}; wait for it to finish.`
        )
      } catch (probeError) {
        if (probeError?.code !== "ESRCH") throw probeError
      }
      const stale = `${lockPath}.stale-${process.pid}-${randomUUID()}`
      await rename(lockPath, stale)
      await rm(stale, { force: true })
      handle = await open(lockPath, "wx", 0o600)
    }
    try {
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, instanceId, token, startedAt: new Date().toISOString() })}\n`
      )
      await handle.sync()
    } finally {
      await handle.close()
    }
  })
  return { lockPath, token }
}

async function releaseGlobalMutationLease(root, lease) {
  if (!lease) return
  await withRegistryLock(root, async () => {
    let owner
    try {
      owner = JSON.parse(await readFile(lease.lockPath, "utf8"))
    } catch (error) {
      if (error?.code === "ENOENT") return
      throw error
    }
    if (owner?.token === lease.token) await rm(lease.lockPath, { force: true })
  })
}

export async function launchGlobalWebHost({
  packageRoot = "",
  env = process.env,
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn,
  resolveGlobal = resolveCanonicalGlobal,
  npmCommand = runNpmCommand,
  verifyRuntime = verifyInstalledRuntime,
  waitForRunningUpdate = updateRunningServer,
  requestTimeoutMs = CONTROL_REQUEST_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "This Node.js runtime does not provide fetch for the WebUI bridge."
    )
  }
  const version = await packageVersion(packageRoot)
  const lifecycleRoot = registryRoot(env)
  const managedRegistry = await readRegistry(lifecycleRoot)
  const defaultRecord = findInstance(managedRegistry, DEFAULT_INSTANCE_ID)
  const runningRecords = managedRegistry.instances.filter(
    (instance) => instance.status === "running"
  )
  const nonDefaultRunning = runningRecords.filter(
    (instance) => instance.id !== DEFAULT_INSTANCE_ID
  )
  const configRootPath = defaultRecord?.configRoot ?? configRoot(env)
  const persistedSettings = await serverSettings(configRootPath)
  const settings = defaultRecord
    ? { host: defaultRecord.host, port: defaultRecord.port }
    : persistedSettings
  const url = updateUrl(settings)
  const global = await resolveGlobal({ env, spawnImpl, npmCommand })
  const canonicalRuntime = await readGlobalRuntime(
    global.packageRoot,
    verifyRuntime
  )
  const needsInstall =
    !canonicalRuntime || compareSemver(canonicalRuntime.version, version) < 0
  if (
    nonDefaultRunning.length > 0 &&
    defaultRecord?.status !== "running" &&
    needsInstall
  ) {
    throw new Error(
      `The canonical global installation is in use by managed instance(s) ${nonDefaultRunning
        .map((instance) => instance.id)
        .join(
          ", "
        )}; stop them before installing or mutating the shared package.`
    )
  }
  const running = await readHealth(fetchImpl, url)
  if (running && defaultRecord?.status === "running") {
    const daemon = await readDaemonState(lifecycleRoot, DEFAULT_INSTANCE_ID)
    if (!daemon) {
      throw new Error(
        `The default managed instance at ${url} has no authenticated daemon state; refusing global mutation.`
      )
    }
    let identityResponse
    try {
      const control = new URL(daemon.controlUrl)
      if (control.protocol !== "http:" || control.hostname !== DEFAULT_HOST) {
        throw new Error(
          "The default daemon control descriptor is not loopback HTTP."
        )
      }
      identityResponse = await fetchImpl(`${control.origin}/identity`, {
        headers: { Authorization: `Bearer ${daemon.controlToken}` },
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
    } catch (error) {
      throw new Error(
        `The default managed instance identity could not be verified: ${toError(error).message}`
      )
    }
    const identity = await readResponseBody(identityResponse)
    if (
      !identityResponse.ok ||
      identity?.name !== APP_NAME ||
      identity.instanceId !== DEFAULT_INSTANCE_ID ||
      identity.pid !== daemon.pid ||
      identity.port !== settings.port ||
      pathKey(identity.configRoot ?? "") !== pathKey(configRootPath) ||
      identity.status !== "running"
    ) {
      throw new Error(
        `The default managed instance at ${url} returned an unverifiable identity; refusing global mutation.`
      )
    }
  }
  if (!running && nonDefaultRunning.length > 0 && needsInstall) {
    throw new Error(
      `The default managed instance at ${url} is unavailable while other managed instances are registered as running; refusing shared global mutation.`
    )
  }
  if (running) {
    if (!isStableVersion(running.version)) {
      throw new Error(
        `The running ${APP_NAME} at ${url} reports invalid version ${running.version}. The running service was left untouched.`
      )
    }
    if (!canonicalRuntime || canonicalRuntime.version !== running.version) {
      throw new Error(
        `The running ${APP_NAME} at ${url} reports version ${running.version}, but the verified canonical global package is ${canonicalRuntime?.version ?? "missing"}. The running service was left untouched; refusing to replace global files without a proven identity.`
      )
    }
    const controlStatus = await readUpdateStatus(fetchImpl, url, {
      timeoutMs: requestTimeoutMs,
    })
    if (
      !controlStatus ||
      !controlStatus.supported ||
      controlStatus.currentVersion !== canonicalRuntime.version
    ) {
      throw new Error(
        `The running ${APP_NAME} at ${url} did not prove a supported canonical update supervisor for version ${canonicalRuntime.version}. The running service was left untouched.`
      )
    }
    if (compareSemver(version, running.version) > 0) {
      await waitForRunningUpdate({
        configRootPath,
        url,
        targetVersion: version,
        fetchImpl,
        requestTimeoutMs,
      })
      return { url, version, child: null, updatedRunning: true }
    }
    return { url, version: running.version, child: null, updatedRunning: false }
  }

  const liveLock = await readLiveInstanceLock(configRootPath)
  if (liveLock) {
    throw new Error(
      `A ${APP_NAME} process (PID ${liveLock.pid}) owns ${liveLock.lockPath}, but ${url}/api/v1/health is unavailable. Refusing to modify the global installation while the existing service may still be running.`
    )
  }

  let runtime = canonicalRuntime
  let mutationLease = null
  if (needsInstall) {
    mutationLease = await acquireGlobalMutationLease(lifecycleRoot, null)
    let retainLease = false
    try {
      runtime = await ensureCanonicalGlobal({
        packageRoot,
        version,
        env,
        spawnImpl,
        resolveGlobal,
        npmCommand,
        verifyRuntime,
        resolvedGlobal: global,
        existingRuntime: canonicalRuntime,
      })
    } catch (error) {
      retainLease = Boolean(error?.npmProcessStillRunning)
      throw error
    } finally {
      if (!retainLease) {
        await releaseGlobalMutationLease(lifecycleRoot, mutationLease)
      }
    }
  }
  if (!runtime) {
    throw new Error(
      "The canonical global runtime could not be verified before launch."
    )
  }
  await access(runtime.cliPath)
  const child = spawnImpl(process.execPath, [runtime.cliPath], {
    cwd: process.cwd(),
    detached: true,
    env: { ...env, PI_WEB_CODEX_CONFIG_DIR: configRootPath },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    windowsHide: true,
    shell: false,
  })
  child.unref()
  return { url, version: runtime.version, child, updatedRunning: false }
}

export const resolveGlobalLaunchTarget = launchGlobalWebHost

export { readHealth, updateRunningServer }
