import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { DatabaseSync } from "node:sqlite"
import { createServer } from "node:http"
import {
  mkdir,
  mkdtemp,
  readFile,
  readFile as readText,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  REQUIRED_RUNTIME_FILES,
  UpdateSupervisor,
  compareSemver,
  isStableVersion,
  npmOperationTimeout,
  resolveCanonicalGlobal,
  runNpmCommand,
} from "../bin/update-supervisor.mjs"

const APP_NAME = "pi-web-codex"

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.exitCode = null
    this.signalCode = null
  }

  kill(signal) {
    if (this.exitCode !== null || this.signalCode !== null) return true
    this.signalCode = signal
    this.exitCode = 0
    queueMicrotask(() => this.emit("exit", 0, signal))
    return true
  }
}

async function createRuntime(runtimeRoot, version) {
  await mkdir(runtimeRoot, { recursive: true })
  await writeFile(
    path.join(runtimeRoot, "package.json"),
    JSON.stringify({
      name: APP_NAME,
      version,
      type: "module",
      bin: { [APP_NAME]: "./bin/pi-web-codex.mjs" },
    })
  )
  for (const relative of REQUIRED_RUNTIME_FILES) {
    const target = path.join(runtimeRoot, relative)
    if (relative === "dist/webui-extensions")
      await mkdir(target, { recursive: true })
    else {
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, "export {}\n")
    }
  }
}

function deferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

async function waitFor(predicate, timeout = 3_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error("Timed out waiting for test state.")
}

async function createHarness({
  failCandidate = false,
  blockedInstall = false,
  mutateDatabaseOnCandidate = false,
  failCleanup = false,
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-update-test-"))
  const configRoot = path.join(root, "config")
  const globalRoot = path.join(root, "global", "node_modules", APP_NAME)
  const globalPrefix = path.join(root, "global")
  const oldVersion = "1.0.0"
  const targetVersion = "1.1.0"
  await createRuntime(globalRoot, oldVersion)
  await mkdir(configRoot, { recursive: true })
  if (mutateDatabaseOnCandidate) {
    const database = new DatabaseSync(path.join(configRoot, "state.db"))
    database.exec("CREATE TABLE state (value TEXT NOT NULL)")
    database.prepare("INSERT INTO state (value) VALUES (?)").run("old")
    database.close()
  }

  const versions = new Map([[path.resolve(globalRoot), oldVersion]])
  const installGate = blockedInstall ? deferred() : null
  const healthState = { version: oldVersion }
  const counters = { metadata: 0, globalInstall: 0, globalPack: 0 }
  let supervisor
  let prepared = false
  let nextChild

  const webui = createServer(async (request, response) => {
    if (request.url === "/api/v1/health") {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(
        JSON.stringify({ name: APP_NAME, version: healthState.version })
      )
      return
    }
    if (request.url === "/api/v1/update/prepare" && request.method === "POST") {
      prepared = true
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ operationId: "prepare-test-operation" }))
      return
    }
    if (
      request.url === "/api/v1/update/prepare" &&
      request.method === "DELETE"
    ) {
      prepared = false
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: true }))
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise((resolve, reject) => {
    webui.once("error", reject)
    webui.listen(0, "127.0.0.1", resolve)
  })
  const address = webui.address()
  assert.ok(address && typeof address === "object")

  const fetchImpl = async (url, options) => {
    if (url === "https://registry.test/pi-web-codex") {
      counters.metadata += 1
      return new Response(
        JSON.stringify({ "dist-tags": { latest: targetVersion } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    }
    return fetch(url, options)
  }

  const npmInstall = async (stageRoot, version) => {
    if (installGate) await installGate.promise
    await createRuntime(path.join(stageRoot, "node_modules", APP_NAME), version)
    versions.set(
      path.resolve(path.join(stageRoot, "node_modules", APP_NAME)),
      version
    )
  }
  const npmPack = async (runtimeRoot, destination) => {
    counters.globalPack += 1
    await mkdir(destination, { recursive: true })
    const version =
      versions.get(path.resolve(runtimeRoot)) ??
      JSON.parse(await readText(path.join(runtimeRoot, "package.json"))).version
    const tarball = path.join(destination, `${version}.tgz`)
    await writeFile(tarball, version)
    return tarball
  }
  const npmInstallGlobal = async (tarball) => {
    counters.globalInstall += 1
    const version = (await readFile(tarball, "utf8")).trim()
    await createRuntime(globalRoot, version)
    versions.set(path.resolve(globalRoot), version)
    healthState.version = version
  }
  const npmUninstallGlobal = async () => {
    await rm(globalRoot, { recursive: true, force: true })
  }
  const cliVersion = async (cliPath, _configDir, version) => {
    const runtimeRoot = path.dirname(path.dirname(cliPath))
    assert.equal(versions.get(path.resolve(runtimeRoot)), version)
    return version
  }
  const runtimeSpawner = ({ runtimeRoot, env }) => {
    const child = new FakeChild()
    const version = versions.get(path.resolve(runtimeRoot))
    healthState.version =
      failCandidate && env.PI_WEB_CODEX_UPDATE_VERIFYING === "1"
        ? "9.9.9"
        : version
    if (
      mutateDatabaseOnCandidate &&
      env.PI_WEB_CODEX_UPDATE_VERIFYING === "1"
    ) {
      const database = new DatabaseSync(path.join(configRoot, "state.db"))
      database.prepare("UPDATE state SET value = ?").run("candidate")
      database.close()
    }
    nextChild = child
    return child
  }
  const waitHealthy = async (
    fetcher,
    url,
    child,
    expectedVersion,
    { sleep }
  ) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (child.exitCode !== null) throw new Error("fake child exited")
      const health = await fetcher(`${url}/api/v1/health`)
      if ((await health.json()).version === expectedVersion) return
      await sleep(0)
    }
    throw new Error(`fake health never reached ${expectedVersion}`)
  }

  supervisor = new UpdateSupervisor({
    configRoot,
    runtimeRoot: globalRoot,
    globalRoot,
    globalPrefix,
    version: oldVersion,
    host: "127.0.0.1",
    port: address.port,
    mutationToken: "mutation-test-token",
    registry: "https://registry.test",
    fetchImpl,
    npmInstall,
    npmPack,
    npmInstallGlobal,
    npmUninstallGlobal,
    cliVersion,
    runtimeSpawner,
    waitHealthy,
    removeBackup: failCleanup
      ? async () => {
          throw new Error("fixture cleanup failed")
        }
      : undefined,
    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  })
  await supervisor.start()

  return {
    configRoot,
    globalRoot,
    targetVersion,
    oldVersion,
    webui,
    supervisor,
    healthState,
    counters,
    get prepared() {
      return prepared
    },
    nextChild: () => nextChild,
    releaseInstall: () => installGate?.resolve(),
    async close() {
      await supervisor.shutdown()
      await new Promise((resolve) => webui.close(resolve))
      await rm(root, { recursive: true, force: true })
    },
  }
}

test("update control is authenticated, deduplicated, and switches the canonical global package", async () => {
  const harness = await createHarness({ blockedInstall: true })
  try {
    const { supervisor } = harness
    const unauthorized = await fetch(`${supervisor.controlUrl}/status`)
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.headers.get("access-control-allow-origin"), null)

    const headers = {
      Authorization: `Bearer ${supervisor.controlToken}`,
      "Content-Type": "application/json",
    }
    const firstStatus = await fetch(`${supervisor.controlUrl}/status`, {
      headers,
    })
    assert.equal(firstStatus.status, 200)
    const status = await firstStatus.json()
    assert.deepEqual(Object.keys(status).sort(), [
      "available",
      "currentVersion",
      "error",
      "latestVersion",
      "operationId",
      "phase",
      "supported",
    ])
    assert.equal(status.available, true)
    assert.equal(harness.counters.metadata, 1)
    const secondStatus = await fetch(`${supervisor.controlUrl}/status`, {
      headers,
    })
    assert.equal(secondStatus.status, 200)
    assert.equal(harness.counters.metadata, 1)

    const accepted = await fetch(`${supervisor.controlUrl}/update`, {
      method: "POST",
      headers,
      body: JSON.stringify({ version: harness.targetVersion }),
    })
    assert.equal(accepted.status, 202)
    assert.equal((await accepted.json()).phase, "installing")

    const duplicate = await fetch(`${supervisor.controlUrl}/update`, {
      method: "POST",
      headers,
      body: JSON.stringify({ version: harness.targetVersion }),
    })
    assert.equal(duplicate.status, 409)
    harness.releaseInstall()
    await waitFor(async () => (await supervisor.status()).phase === "succeeded")
    assert.equal(supervisor.currentVersion, harness.targetVersion)
    assert.equal(
      JSON.parse(
        await readFile(path.join(harness.globalRoot, "package.json"), "utf8")
      ).version,
      harness.targetVersion
    )
    assert.equal(harness.prepared, false)
    assert.equal(harness.counters.globalInstall, 1)
    assert.equal(harness.nextChild().exitCode, null)
  } finally {
    await harness.close()
  }
})

test("simultaneous update admissions allow only one operation", async () => {
  const harness = await createHarness({ blockedInstall: true })
  try {
    const results = await Promise.all([
      harness.supervisor.requestUpdate({ version: harness.targetVersion }),
      harness.supervisor.requestUpdate({ version: harness.targetVersion }),
    ])
    assert.deepEqual(
      results.map((result) => result.status).sort((a, b) => a - b),
      [202, 409]
    )
    harness.releaseInstall()
    await waitFor(() => harness.supervisor.phase === "succeeded")
  } finally {
    await harness.close()
  }
})

test("install failure keeps the old global runtime and reports failed state", async () => {
  const harness = await createHarness()
  const original = harness.supervisor.npmInstall
  harness.supervisor.npmInstall = async () => {
    throw new Error("fixture npm install failed")
  }
  try {
    const result = await harness.supervisor.requestUpdate({
      version: harness.targetVersion,
    })
    assert.equal(result.status, 202)
    await waitFor(() => harness.supervisor.phase === "failed")
    assert.equal(harness.supervisor.currentVersion, harness.oldVersion)
    assert.match(harness.supervisor.error, /fixture npm install failed/)
    assert.equal(harness.counters.globalInstall, 0)
    assert.equal(harness.nextChild().exitCode, null)
  } finally {
    harness.supervisor.npmInstall = original
    await harness.close()
  }
})

test("candidate health failure restores the pre-update global tarball and service", async () => {
  const harness = await createHarness({ failCandidate: true })
  try {
    const result = await harness.supervisor.requestUpdate({
      version: harness.targetVersion,
    })
    assert.equal(result.status, 202)
    await waitFor(() => harness.supervisor.phase === "failed")
    assert.equal(harness.supervisor.currentVersion, harness.oldVersion)
    assert.match(harness.supervisor.error, /fake health never reached 1\.1\.0/)
    assert.equal(
      JSON.parse(
        await readFile(path.join(harness.globalRoot, "package.json"), "utf8")
      ).version,
      harness.oldVersion
    )
    assert.equal(harness.healthState.version, harness.oldVersion)
    assert.equal(harness.nextChild().exitCode, null)
  } finally {
    await harness.close()
  }
})

test("a mismatched canonical npm root refuses update before staging or install", async () => {
  const harness = await createHarness()
  try {
    harness.supervisor.canonicalGlobalResolved = false
    harness.supervisor.globalPrefix = null
    harness.supervisor.canonicalResolver = async () => ({
      packageRoot: path.join(
        path.dirname(harness.globalRoot),
        "other",
        APP_NAME
      ),
      prefix: path.join(path.dirname(harness.globalRoot), "other"),
    })
    const result = await harness.supervisor.requestUpdate({
      version: harness.targetVersion,
    })
    assert.equal(result.status, 503)
    assert.equal(harness.supervisor.supported, false)
    assert.match(harness.supervisor.error, /canonical global package/)
    assert.equal(harness.counters.globalInstall, 0)
    assert.equal(harness.supervisor.currentVersion, harness.oldVersion)
  } finally {
    await harness.close()
  }
})

test("post-release cleanup failure leaves the verified new global runtime active", async () => {
  const harness = await createHarness({ failCleanup: true })
  try {
    const result = await harness.supervisor.requestUpdate({
      version: harness.targetVersion,
    })
    assert.equal(result.status, 202)
    await waitFor(() => harness.supervisor.phase === "succeeded")
    assert.equal(harness.supervisor.currentVersion, harness.targetVersion)
    assert.match(harness.supervisor.error, /cleanup did not complete/)
    assert.equal(
      JSON.parse(
        await readFile(path.join(harness.globalRoot, "package.json"), "utf8")
      ).version,
      harness.targetVersion
    )
  } finally {
    await harness.close()
  }
})

test("candidate database changes are restored before the old runtime is restarted", async () => {
  const harness = await createHarness({
    failCandidate: true,
    mutateDatabaseOnCandidate: true,
  })
  try {
    const result = await harness.supervisor.requestUpdate({
      version: harness.targetVersion,
    })
    assert.equal(result.status, 202)
    await waitFor(() => harness.supervisor.phase === "failed")
    const database = new DatabaseSync(path.join(harness.configRoot, "state.db"))
    const row = database.prepare("SELECT value FROM state").get()
    database.close()
    assert.equal(row.value, "old")
    assert.equal(harness.supervisor.currentVersion, harness.oldVersion)
    assert.equal(harness.healthState.version, harness.oldVersion)
  } finally {
    await harness.close()
  }
})

test("semantic version comparison rejects prerelease latest metadata and resolver validates npm root", async () => {
  assert.equal(npmOperationTimeout(["root", "--global"]), 30_000)
  assert.equal(npmOperationTimeout(["prefix", "--global"]), 30_000)
  assert.equal(npmOperationTimeout(["pack", "--json"]), 600_000)
  assert.equal(npmOperationTimeout(["install", "--global"]), 600_000)

  assert.equal(compareSemver("1.0.0", "1.0.1"), -1)
  assert.equal(compareSemver("1.0.0", "1.0.0+build"), 0)
  assert.equal(
    compareSemver("999999999999999999999.0.0", "1000000000000000000000.0.0"),
    -1
  )
  assert.equal(isStableVersion("1.0.0"), true)
  assert.equal(isStableVersion("1.0.0-rc.1"), false)

  const isolatedPrefix = path.join(tmpdir(), "isolated-prefix")
  const isolatedRoot = path.join(isolatedPrefix, "node_modules")
  const calls = []
  const resolved = await resolveCanonicalGlobal({
    npmCommand: async (args) => {
      calls.push(args)
      if (args.includes("prefix")) return { stdout: `${isolatedPrefix}\n` }
      return { stdout: `${isolatedRoot}\n` }
    },
    env: {},
  })
  assert.equal(resolved.prefix, isolatedPrefix)
  assert.equal(resolved.root, isolatedRoot)
  assert.equal(calls.length, 3)
})

test("npm timeout waits for the child exit before rejecting", async () => {
  const child = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  const signals = []
  child.kill = (signal) => {
    signals.push(signal)
    setTimeout(() => {
      child.exitCode = 1
      child.signalCode = signal
      child.emit("close", null, signal)
    }, 25)
    return true
  }
  const startedAt = Date.now()
  await assert.rejects(
    runNpmCommand(["install", "--global"], { timeoutMs: 5 }, () => child),
    /timed out after 5ms/
  )
  assert.ok(Date.now() - startedAt >= 20)
  assert.deepEqual(signals, ["SIGTERM"])
})

test("npm abort waits for the child exit before rejecting", async () => {
  const child = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  child.kill = (signal) => {
    setTimeout(() => {
      child.exitCode = 1
      child.signalCode = signal
      child.emit("close", null, signal)
    }, 25)
    return true
  }
  const controller = new AbortController()
  const startedAt = Date.now()
  const command = runNpmCommand(
    ["install", "--global"],
    { signal: controller.signal },
    () => child
  )
  setTimeout(() => controller.abort(), 5)
  await assert.rejects(
    command,
    /cancelled because the supervisor is shutting down/
  )
  assert.ok(Date.now() - startedAt >= 20)
})

test("structured npm output is not truncated at the ordinary diagnostic limit", async () => {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  const payload = JSON.stringify({ files: "x".repeat(40_000) })
  const command = runNpmCommand(
    ["pack", "--json"],
    { timeoutMs: 1_000 },
    () => child
  )
  queueMicrotask(() => {
    child.stdout.emit("data", payload)
    child.exitCode = 0
    child.emit("close", 0, null)
  })
  const result = await command
  assert.equal(result.stdout, payload)
})
