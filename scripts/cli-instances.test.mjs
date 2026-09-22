import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer as createHttpServer } from "node:http"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { createServer as createNetServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  globalUpdateLockFile,
  registryRoot,
} from "../bin/instance-registry.mjs"

const sourceRoot = path.resolve(import.meta.dirname, "..")
const sourceBin = path.join(sourceRoot, "bin")
const sourcePackage = JSON.parse(
  await readFile(path.join(sourceRoot, "package.json"), "utf8")
)

async function pathExists(target) {
  try {
    await readFile(target)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

async function waitFor(predicate, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === "ESRCH") return false
    if (error?.code === "EPERM") return true
    throw error
  }
}

async function waitForProcessExit(pid, label) {
  await waitFor(() => !processIsAlive(pid), label)
}

async function freePort() {
  const server = createNetServer()
  const port = await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      assert.ok(address && typeof address === "object")
      resolve(address.port)
    })
  })
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function occupyPort(port) {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" })
    response.end("occupied")
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  return server
}

async function closeServer(server) {
  if (!server) return
  await new Promise((resolve) => server.close(() => resolve()))
}

async function killPidTree(pid) {
  if (!processIsAlive(pid)) return
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `taskkill /PID ${pid} /T /F`],
        { stdio: "ignore", windowsHide: true, shell: false }
      )
      child.once("error", reject)
      child.once("close", (code) => {
        if (code === 0 || !processIsAlive(pid)) resolve()
        else reject(new Error(`Could not terminate fixture PID tree ${pid}.`))
      })
    })
  } else {
    try {
      process.kill(pid, "SIGTERM")
    } catch (error) {
      if (error?.code !== "ESRCH") throw error
    }
  }
  await waitForProcessExit(pid, `fixture PID ${pid} to exit`)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-instances-"))
  const bin = path.join(root, "bin")
  const appData = path.join(root, "appdata")
  const home = path.join(root, "home")
  const pidDirectory = path.join(root, "descendant-pids")
  await mkdir(bin, { recursive: true })
  await mkdir(pidDirectory, { recursive: true })

  for (const entry of await readdir(sourceBin, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mjs")) continue
    await copyFile(path.join(sourceBin, entry.name), path.join(bin, entry.name))
  }

  await mkdir(path.join(root, "dist", "app", "apps", "web"), {
    recursive: true,
  })
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "pi-web-codex",
      version: sourcePackage.version,
      type: "module",
      bin: { "pi-web-codex": "./bin/pi-web-codex.mjs" },
    })
  )
  await writeFile(
    path.join(root, "dist", "app", "apps", "web", "server.js"),
    `import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const name = "pi-web-codex"
const version = ${JSON.stringify(sourcePackage.version)}
const host = process.env.HOSTNAME ?? "127.0.0.1"
const port = Number(process.env.PORT)
const instanceId = process.env.PI_WEB_CODEX_INSTANCE_ID ?? "unknown"
const pidDirectory = process.env.PI_WEB_CODEX_TEST_CHILD_PID_DIR
const delayMs = Math.max(0, Number(process.env.PI_WEB_CODEX_TEST_READY_DELAY_MS ?? "0"))

const server = createServer((request, response) => {
  if (request.url !== "/api/v1/health") {
    response.writeHead(404)
    response.end("not found")
    return
  }
  const body = JSON.stringify({ name, version, instanceId, port })
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  })
  response.end(body)
})

let listening = false
function shutdown() {
  if (!listening) {
    process.exit(0)
    return
  }
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1_000).unref()
}
process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)

if (pidDirectory) {
  await mkdir(pidDirectory, { recursive: true })
  const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  })
  descendant.unref()
  await writeFile(path.join(pidDirectory, instanceId + ".pid"), String(descendant.pid))
}

setTimeout(() => {
  server.listen(port, host, () => {
    listening = true
  })
}, delayMs)
`
  )

  const env = {
    ...process.env,
    APPDATA: appData,
    USERPROFILE: home,
    HOME: home,
    XDG_CONFIG_HOME: path.join(root, "xdg"),
    PI_WEB_CODEX_TEST_CHILD_PID_DIR: pidDirectory,
    PI_WEB_CODEX_TEST_READY_DELAY_MS: "0",
  }
  const fixture = {
    root,
    cli: path.join(bin, "pi-web-codex.mjs"),
    env,
    registry: registryRoot(env),
    pidDirectory,
    activeChildren: new Set(),
  }
  fixture.pidPath = (id) => path.join(pidDirectory, `${id}.pid`)
  return fixture
}

function spawnCli(fixture, args, overrides = {}) {
  const child = spawn(process.execPath, [fixture.cli, ...args], {
    cwd: fixture.root,
    env: { ...fixture.env, ...overrides },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  fixture.activeChildren.add(child)
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    output += chunk.toString()
  })
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => {
      fixture.activeChildren.delete(child)
      resolve({ code, signal, output })
    })
  })
  return { child, closed, output: () => output }
}

async function runCli(fixture, args, overrides = {}, timeoutMs = 10_000) {
  const startedAt = Date.now()
  const command = spawnCli(fixture, args, overrides)
  let timer
  try {
    const result = await Promise.race([
      command.closed,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`CLI timed out: ${args.join(" ")}`)),
          timeoutMs
        )
      }),
    ])
    return { ...result, durationMs: Date.now() - startedAt }
  } catch (error) {
    await killPidTree(command.child.pid).catch(() => {})
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function cleanupFixture(fixture) {
  for (const child of fixture.activeChildren) {
    await killPidTree(child.pid).catch(() => {})
  }
  let registry
  try {
    registry = JSON.parse(
      await readFile(path.join(fixture.registry, "instances.json"), "utf8")
    )
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  for (const instance of registry?.instances ?? []) {
    if (instance.daemon?.pid)
      await killPidTree(instance.daemon.pid).catch(() => {})
  }
  try {
    for (const entry of await readdir(fixture.pidDirectory)) {
      if (!entry.endsWith(".pid")) continue
      const pid = Number(
        (await readFile(path.join(fixture.pidDirectory, entry), "utf8")).trim()
      )
      await killPidTree(pid).catch(() => {})
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
}

async function readHealth(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
      signal: AbortSignal.timeout(500),
    })
    if (!response.ok) return null
    const body = await response.json()
    return body?.name === "pi-web-codex" ? body : null
  } catch (error) {
    if (error instanceof TypeError || error?.name === "AbortError") return null
    throw error
  }
}

async function listJson(fixture) {
  const result = await runCli(fixture, ["list", "--json"])
  assert.equal(result.code, 0, result.output)
  return JSON.parse(result.output.trim())
}

function recordFor(list, id) {
  return list.instances.find((instance) => instance.id === id)
}

async function writeSettings(configDir, port, marker) {
  await mkdir(configDir, { recursive: true })
  const config = {
    schemaVersion: 3,
    revision: 1,
    server: { host: "127.0.0.1", port, openBrowser: false },
    marker,
  }
  await writeFile(
    path.join(configDir, "config.json"),
    `${JSON.stringify(config)}\n`
  )
  return readFile(path.join(configDir, "config.json"), "utf8")
}

test("instance CLI help, invalid commands, and startup failures are bounded", async () => {
  const fixture = await createFixture()
  let occupied
  try {
    const help = await runCli(fixture, ["--help"])
    assert.equal(help.code, 0, help.output)
    assert.match(help.output, /list \[--json\]/)
    assert.equal(
      await pathExists(path.join(fixture.registry, "instances.json")),
      false
    )

    for (const rawPort of ["0", "65536", "not-a-port"]) {
      const result = await runCli(fixture, ["--no-open", "--port", rawPort])
      assert.equal(result.code, 1)
      assert.match(result.output, /--port|between 1 and 65535/)
      assert.ok(result.durationMs < 5_000)
    }

    for (const args of [
      ["start", "missing"],
      ["stop", "missing"],
    ]) {
      const result = await runCli(fixture, args)
      assert.equal(result.code, 1)
      assert.match(result.output, /does not exist/)
      assert.ok(result.durationMs < 5_000)
    }

    const blockedPort = await freePort()
    const blockedId = String(blockedPort)
    const globalLease = globalUpdateLockFile(fixture.registry)
    const seed = await runCli(fixture, [
      "--no-open",
      "--port",
      String(blockedPort),
    ])
    assert.equal(seed.code, 0, seed.output)
    await waitFor(() => readHealth(blockedPort), "global lease fixture health")
    const seedStop = await runCli(fixture, ["stop", blockedId])
    assert.equal(seedStop.code, 0, seedStop.output)
    await waitFor(
      () => readHealth(blockedPort).then((value) => value === null),
      "global lease fixture stop"
    )
    await rm(fixture.pidPath(blockedId), { force: true })
    await mkdir(fixture.registry, { recursive: true })
    await writeFile(
      globalLease,
      `${JSON.stringify({
        pid: process.pid,
        token: "held-update-test",
        instanceId: "update-fixture",
      })}\n`
    )
    try {
      const blockedLaunch = await runCli(fixture, [
        "--no-open",
        "--port",
        String(blockedPort),
      ])
      assert.equal(blockedLaunch.code, 1)
      assert.match(blockedLaunch.output, /managed update|global update|lease/i)
      assert.equal(await pathExists(fixture.pidPath(blockedId)), false)

      const blockedStart = await runCli(fixture, [
        "start",
        blockedId,
        "--no-open",
      ])
      assert.equal(blockedStart.code, 1)
      assert.match(blockedStart.output, /managed update|global update|lease/i)
      assert.equal(await pathExists(fixture.pidPath(blockedId)), false)
    } finally {
      await rm(globalLease, { force: true })
    }

    const occupiedPort = await freePort()
    occupied = await occupyPort(occupiedPort)
    const startedAt = Date.now()
    const failure = await runCli(fixture, [
      "--no-open",
      "--port",
      String(occupiedPort),
    ])
    assert.equal(failure.code, 1)
    assert.match(failure.output, /already in use|refusing to guess/i)
    assert.ok(Date.now() - startedAt < 5_000)
  } finally {
    await closeServer(occupied)
    await cleanupFixture(fixture)
  }
})

test("multiple port-bound instances retain settings and lifecycle state", async () => {
  const fixture = await createFixture()
  let defaultPort
  let alternatePort
  try {
    defaultPort = await freePort()
    alternatePort = await freePort()
    while (alternatePort === defaultPort) alternatePort = await freePort()

    const defaultConfig = await writeSettings(
      fixture.registry,
      defaultPort,
      "default-settings"
    )
    const defaultLaunch = await runCli(fixture, ["--no-open"])
    assert.equal(defaultLaunch.code, 0, defaultLaunch.output)
    await waitFor(() => readHealth(defaultPort), "default instance health")

    const alternateLaunch = await runCli(fixture, [
      "--no-open",
      "--port",
      String(alternatePort),
    ])
    assert.equal(alternateLaunch.code, 0, alternateLaunch.output)
    await waitFor(() => readHealth(alternatePort), "alternate instance health")

    let list = await listJson(fixture)
    assert.equal(list.defaultInstanceId, "default")
    assert.equal(recordFor(list, "default")?.port, defaultPort)
    assert.equal(recordFor(list, "default")?.status, "running")
    const alternateId = String(alternatePort)
    const alternate = recordFor(list, alternateId)
    assert.equal(alternate?.port, alternatePort)
    assert.equal(alternate?.status, "running")
    assert.ok(alternate?.configDir)
    const alternateConfig = await writeSettings(
      alternate.configDir,
      alternatePort,
      "alternate-settings"
    )

    const bareStop = await runCli(fixture, ["stop"])
    assert.equal(bareStop.code, 0, bareStop.output)
    await waitFor(
      () => readHealth(defaultPort).then((value) => value === null),
      "default instance stop"
    )
    await waitFor(() => readHealth(alternatePort), "alternate remains running")
    list = await listJson(fixture)
    assert.equal(recordFor(list, "default")?.status, "stopped")
    assert.equal(recordFor(list, alternateId)?.status, "running")

    const restartDefault = await runCli(fixture, [
      "start",
      "default",
      "--no-open",
    ])
    assert.equal(restartDefault.code, 0, restartDefault.output)
    await waitFor(() => readHealth(defaultPort), "default restart")
    assert.equal(
      await readFile(path.join(fixture.registry, "config.json"), "utf8"),
      await defaultConfig
    )

    const stopAlternate = await runCli(fixture, ["stop", alternateId])
    assert.equal(stopAlternate.code, 0, stopAlternate.output)
    await waitFor(
      () => readHealth(alternatePort).then((value) => value === null),
      "alternate stop"
    )
    await waitForProcessExit(
      Number((await readFile(fixture.pidPath(alternateId), "utf8")).trim()),
      "alternate descendant cleanup"
    )
    const idempotentStop = await runCli(fixture, ["stop", alternateId])
    assert.equal(idempotentStop.code, 0, idempotentStop.output)
    assert.match(idempotentStop.output, /already stopped/i)

    const startAlternate = await runCli(fixture, [
      "start",
      alternateId,
      "--no-open",
    ])
    assert.equal(startAlternate.code, 0, startAlternate.output)
    await waitFor(() => readHealth(alternatePort), "alternate restart")
    assert.equal(
      await readFile(path.join(alternate.configDir, "config.json"), "utf8"),
      await alternateConfig
    )
    const repeatedStart = await runCli(fixture, [
      "start",
      alternateId,
      "--no-open",
    ])
    assert.equal(repeatedStart.code, 0, repeatedStart.output)
    await waitFor(() => readHealth(alternatePort), "repeated alternate start")

    const stopDefault = await runCli(fixture, ["stop", "default"])
    assert.equal(stopDefault.code, 0, stopDefault.output)
    await waitFor(
      () => readHealth(defaultPort).then((value) => value === null),
      "final default stop"
    )
    const finalStopAlternate = await runCli(fixture, ["stop", alternateId])
    assert.equal(finalStopAlternate.code, 0, finalStopAlternate.output)
    await waitFor(
      () => readHealth(alternatePort).then((value) => value === null),
      "final alternate stop"
    )
  } finally {
    await cleanupFixture(fixture)
  }
})

test("daemon survives launcher exit during delayed startup", async () => {
  const fixture = await createFixture()
  let launcher
  try {
    const port = await freePort()
    const id = String(port)
    launcher = spawnCli(fixture, ["--no-open", "--port", String(port)], {
      PI_WEB_CODEX_TEST_READY_DELAY_MS: "500",
    })
    const lockPath = path.join(
      fixture.registry,
      "instances",
      id,
      "config",
      "locks",
      "instance.lock"
    )
    await waitFor(() => pathExists(lockPath), "delayed daemon lock")
    assert.equal(await readHealth(port), null)
    const startingList = await listJson(fixture)
    assert.equal(recordFor(startingList, id)?.status, "running")
    assert.equal(launcher.child.exitCode, null)
    launcher.child.kill()
    await Promise.race([
      launcher.closed,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Launcher did not exit after termination.")),
          3_000
        )
      ),
    ])

    await waitFor(() => readHealth(port), "daemon health after launcher exit")
    const list = await listJson(fixture)
    assert.equal(recordFor(list, id)?.status, "running")
    const stopped = await runCli(fixture, ["stop", id])
    assert.equal(stopped.code, 0, stopped.output)
    await waitFor(
      () => readHealth(port).then((value) => value === null),
      "delayed daemon stop"
    )
  } finally {
    if (launcher?.child && launcher.child.exitCode === null) {
      await killPidTree(launcher.child.pid).catch(() => {})
    }
    await cleanupFixture(fixture)
  }
})
