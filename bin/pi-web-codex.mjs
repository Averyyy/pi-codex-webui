#!/usr/bin/env node

import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access, mkdir, open, readFile, rename, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { homedir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const APP_NAME = "pi-web-codex"
const DEFAULTS = { host: "127.0.0.1", port: 1816, openBrowser: true }
const packageRoot = fileURLToPath(new URL("..", import.meta.url))

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

function configRoot(override) {
  if (override) return path.resolve(override)
  if (process.env.PI_WEB_CODEX_CONFIG_DIR) {
    return path.resolve(process.env.PI_WEB_CODEX_CONFIG_DIR)
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", APP_NAME)
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      APP_NAME
    )
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    APP_NAME
  )
}

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help") options.help = true
    else if (argument === "--version") options.version = true
    else if (argument === "--open") options.openBrowser = true
    else if (argument === "--no-open") options.openBrowser = false
    else if (["--host", "--port", "--config-dir"].includes(argument)) {
      const value = argv[index + 1]
      if (!value) throw new Error(`${argument} requires a value.`)
      options[argument.slice(2).replace("-dir", "Dir")] = value
      index += 1
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return options
}

async function readSettings(root) {
  try {
    const config = JSON.parse(
      await readFile(path.join(root, "config.json"), "utf8")
    )
    const { host, port, openBrowser } = config.server
    if (
      host !== DEFAULTS.host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      typeof openBrowser !== "boolean"
    ) {
      throw new Error("config.json contains invalid server settings.")
    }
    return { host, port, openBrowser }
  } catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULTS }
    throw error
  }
}

async function readHealth(url) {
  try {
    const response = await fetch(`${url}/api/v1/health`, {
      signal: AbortSignal.timeout(500),
    })
    if (!response.ok) return null
    let body
    try {
      body = await response.json()
    } catch (error) {
      if (error instanceof SyntaxError) return null
      throw error
    }
    return body?.name === APP_NAME ? body : null
  } catch (error) {
    if (
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      error instanceof TypeError
    ) {
      return null
    }
    throw error
  }
}

async function isHealthy(url, version) {
  const health = await readHealth(url)
  return Boolean(health && (!version || health.version === version))
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
    if (error.code === "ESRCH") return false
    if (error.code === "EPERM") return true
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
    if (error.code === "ENOENT") throw error
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
      `Do not delete or replace this lock while that process is running.`
  )
}

async function createLock(lockPath) {
  const lock = await open(lockPath, "wx", 0o600)
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`)
    await lock.close()
  } catch (error) {
    try {
      await lock.close()
    } finally {
      await rm(lockPath, { force: true })
    }
    throw error
  }
  return lockPath
}

async function acquireLock(root) {
  const lockDirectory = path.join(root, "locks")
  const lockPath = path.join(lockDirectory, "instance.lock")
  const recoveryPath = `${lockPath}.recovery`
  await mkdir(lockDirectory, { recursive: true, mode: 0o700 })

  for (;;) {
    try {
      await mkdir(recoveryPath, { mode: 0o700 })
    } catch (error) {
      if (error.code === "EEXIST") {
        throw lockRecoveryDiagnostic(lockPath, recoveryPath)
      }
      throw error
    }

    try {
      try {
        return await createLock(lockPath)
      } catch (error) {
        if (error.code !== "EEXIST") throw error
      }

      let owner
      try {
        owner = await readLockOwner(lockPath)
      } catch (error) {
        if (error.code === "ENOENT") continue
        throw error
      }
      if (processIsAlive(owner.pid)) {
        throw activeLockError(lockPath, owner.pid)
      }

      const staleLockPath = `${lockPath}.stale-${process.pid}-${randomUUID()}`
      try {
        await rename(lockPath, staleLockPath)
      } catch (error) {
        if (error.code === "ENOENT") continue
        throw error
      }
      await rm(staleLockPath, { force: true })
      try {
        return await createLock(lockPath)
      } catch (error) {
        if (error.code !== "EEXIST") throw error
      }
    } finally {
      await rm(recoveryPath, { recursive: true, force: true })
    }
  }
}

async function waitUntilHealthy(url, child, version) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js exited before becoming healthy (${child.exitCode}).`
      )
    }
    if (await isHealthy(url, version)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${url}/api/v1/health.`)
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
  })
  launcher.once("error", (error) =>
    console.error(`Could not open browser: ${error.message}`)
  )
  launcher.unref()
}

async function readPackageVersion() {
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8")
  )
  return packageJson.version
}

function announceReady(url) {
  console.log(`${APP_NAME} is ready at ${url}`)
  if (typeof process.send === "function" && process.connected) {
    process.send({ type: "ready", url })
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log(
      `Usage: ${APP_NAME} [options]\n\n--host <host>\n--port <port>\n--open\n--no-open\n--config-dir <path>\n--version\n--help`
    )
    return
  }
  if (options.version) {
    console.log(await readPackageVersion())
    return
  }

  assertSqliteFts5()

  const packageVersion = await readPackageVersion()

  const root = configRoot(options.configDir)
  const persisted = await readSettings(root)
  const host = options.host ?? persisted.host
  const port = options.port ? Number(options.port) : persisted.port
  const shouldOpen = options.openBrowser ?? persisted.openBrowser
  if (host !== DEFAULTS.host) {
    throw new Error(
      "Only 127.0.0.1 is allowed until LAN authentication is implemented."
    )
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535.")
  }

  const url = `http://${host}:${port}`
  const existingHealth = await readHealth(url)
  if (existingHealth) {
    if (existingHealth.version !== packageVersion) {
      throw new Error(
        `Another ${APP_NAME} instance is already running at ${url} (version ${existingHealth.version ?? "unknown"}), but this CLI is version ${packageVersion}. Stop the existing instance before starting the new version.`
      )
    }
    announceReady(url)
    if (shouldOpen) openBrowser(url)
    return
  }

  try {
    await assertPortAvailable(host, port)
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      throw new Error(
        `Port ${port} is already in use.\n\nAnother ${APP_NAME} instance may already be running.\nOpen the existing instance or configure another port.`
      )
    }
    throw error
  }

  const serverPath = path.join(
    packageRoot,
    "dist",
    "app",
    "apps",
    "web",
    "server.js"
  )
  await access(serverPath, constants.R_OK)
  const lockPath = await acquireLock(root)

  const child = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      HOSTNAME: host,
      PORT: String(port),
      PI_WEB_CODEX_CONFIG_DIR: root,
      PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT: path.join(
        packageRoot,
        "dist",
        "webui-extensions"
      ),
      PI_WEB_CODEX_PI_WORKER_PATH: path.join(
        packageRoot,
        "dist",
        "workers",
        "pi",
        "dist",
        "worker.mjs"
      ),
      PI_WEB_CODEX_PI_CLIENT_WORKER_PATH: path.join(
        packageRoot,
        "dist",
        "workers",
        "pi-client",
        "dist",
        "worker.mjs"
      ),
    },
    stdio: "inherit",
  })

  let shutdownSignal
  let forceShutdown
  const stopChild = (signal) => {
    shutdownSignal = signal
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill(signal)
    forceShutdown ??= setTimeout(() => child.kill("SIGKILL"), 2_000)
    forceShutdown.unref()
  }
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => stopChild(signal))
  }

  const spawnError = new Promise((_, reject) => child.once("error", reject))

  try {
    await Promise.race([
      waitUntilHealthy(url, child, packageVersion),
      spawnError,
    ])
    announceReady(url)
    if (shouldOpen) openBrowser(url)
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", (exitCode) => resolve(exitCode ?? 1))
    })
    process.exitCode = shutdownSignal
      ? shutdownSignal === "SIGINT"
        ? 130
        : 143
      : code
  } finally {
    if (forceShutdown) clearTimeout(forceShutdown)
    if (child.exitCode === null) child.kill("SIGTERM")
    await rm(lockPath, { force: true })
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  if (typeof process.send === "function" && process.connected) {
    process.send({ type: "error", message })
  }
  console.error(message)
  process.exitCode = 1
})
