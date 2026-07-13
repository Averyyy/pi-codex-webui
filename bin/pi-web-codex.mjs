#!/usr/bin/env node

import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access, mkdir, open, readFile, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { homedir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const APP_NAME = "pi-web-codex"
const DEFAULTS = { host: "127.0.0.1", port: 1816, openBrowser: true }
const packageRoot = fileURLToPath(new URL("..", import.meta.url))

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

async function isHealthy(url) {
  try {
    const response = await fetch(`${url}/api/v1/health`, {
      signal: AbortSignal.timeout(500),
    })
    return response.ok && (await response.json()).name === APP_NAME
  } catch (error) {
    if (
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      error instanceof TypeError
    ) {
      return false
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
    if (error.code === "ESRCH") return false
    if (error.code === "EPERM") return true
    throw error
  }
}

async function acquireLock(root) {
  const lockDirectory = path.join(root, "locks")
  const lockPath = path.join(lockDirectory, "instance.lock")
  await mkdir(lockDirectory, { recursive: true, mode: 0o700 })

  try {
    const lock = await open(lockPath, "wx", 0o600)
    await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`)
    await lock.close()
    return lockPath
  } catch (error) {
    if (error.code !== "EEXIST") throw error
  }

  const owner = JSON.parse(await readFile(lockPath, "utf8"))
  if (Number.isInteger(owner.pid) && processIsAlive(owner.pid)) {
    throw new Error(
      `Another ${APP_NAME} instance is already running (PID ${owner.pid}).`
    )
  }
  await rm(lockPath)
  const lock = await open(lockPath, "wx", 0o600)
  await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`)
  await lock.close()
  return lockPath
}

async function waitUntilHealthy(url, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js exited before becoming healthy (${child.exitCode}).`
      )
    }
    if (await isHealthy(url)) return
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

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log(
      `Usage: ${APP_NAME} [options]\n\n--host <host>\n--port <port>\n--open\n--no-open\n--config-dir <path>\n--version\n--help`
    )
    return
  }
  if (options.version) {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8")
    )
    console.log(packageJson.version)
    return
  }

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
  if (await isHealthy(url)) {
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
    },
    stdio: "inherit",
  })

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal))
  }

  const spawnError = new Promise((_, reject) => child.once("error", reject))

  try {
    await Promise.race([waitUntilHealthy(url, child), spawnError])
    console.log(`${APP_NAME} is ready at ${url}`)
    if (shouldOpen) openBrowser(url)
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", (exitCode) => resolve(exitCode ?? 1))
    })
    process.exitCode = code
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM")
    await rm(lockPath, { force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
