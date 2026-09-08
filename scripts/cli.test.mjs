import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { createServer as createNetServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const root = path.resolve(import.meta.dirname, "..")
const cli = path.join(root, "bin", "pi-web-codex.mjs")
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
)

function listenHealthServer() {
  let response = {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      name: "pi-web-codex",
      version: packageJson.version,
    }),
  }
  const server = createServer((request, res) => {
    if (request.url !== "/api/v1/health") {
      res.writeHead(404)
      res.end("not found")
      return
    }
    res.writeHead(response.status, {
      "Content-Type": response.contentType ?? "application/json",
    })
    res.end(response.body)
  })
  const ready = new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      assert.ok(address && typeof address === "object")
      resolve(address.port)
    })
  })
  return {
    server,
    ready,
    setResponse(next) {
      response = next
    },
  }
}

async function createCliFixture() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "pi-web-cli-fixture-"))
  try {
    const fixtureCli = path.join(fixtureRoot, "bin", "pi-web-codex.mjs")
    const fixtureServer = path.join(
      fixtureRoot,
      "dist",
      "app",
      "apps",
      "web",
      "server.js"
    )
    await mkdir(path.dirname(fixtureCli), { recursive: true })
    await mkdir(path.dirname(fixtureServer), { recursive: true })
    await copyFile(cli, fixtureCli)
    await writeFile(
      path.join(fixtureRoot, "package.json"),
      JSON.stringify({ type: "module", version: packageJson.version })
    )
    await writeFile(
      fixtureServer,
      `import { createServer } from "node:http"

const version = ${JSON.stringify(packageJson.version)}
const server = createServer((request, response) => {
  if (request.url === "/api/v1/health") {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ name: "pi-web-codex", version }))
    return
  }
  response.writeHead(404)
  response.end("not found")
})

server.listen(Number(process.env.PORT), process.env.HOSTNAME ?? "127.0.0.1")
`
    )
    return { cli: fixtureCli, root: fixtureRoot }
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true })
    throw error
  }
}

function runCli(port, configDir, cliPath = cli) {
  const child = spawn(
    process.execPath,
    [cliPath, "--no-open", "--port", String(port), "--config-dir", configDir],
    {
      cwd: root,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: path.join(configDir, "agent"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  let output = ""
  child.stdout.on("data", (chunk) => (output += chunk.toString()))
  child.stderr.on("data", (chunk) => (output += chunk.toString()))
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal, output }))
  })
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

function startCli(port, configDir, cliPath = cli) {
  const child = spawn(
    process.execPath,
    [cliPath, "--no-open", "--port", String(port), "--config-dir", configDir],
    {
      cwd: root,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: path.join(configDir, "agent"),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    }
  )
  let output = ""
  let observedReady = false
  let observeReady
  let failReadyObservation
  const readyObserved = new Promise((resolve, reject) => {
    observeReady = resolve
    failReadyObservation = reject
  })
  const markReady = () => {
    if (observedReady) return
    observedReady = true
    observeReady()
  }
  const observe = (chunk) => {
    output += chunk.toString()
    if (output.includes("pi-web-codex is ready at")) markReady()
  }
  child.stdout.on("data", observe)
  child.stderr.on("data", observe)
  child.on("message", (message) => {
    if (message?.type === "ready") markReady()
  })
  child.once("close", (code, signal) => {
    if (!observedReady) {
      failReadyObservation(
        new Error(
          `CLI exited before becoming ready (${code ?? signal ?? "unknown"}): ${output}`
        )
      )
    }
  })
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal, output }))
  })
  return { child, closed, readyObserved }
}

async function stopCli(instance) {
  if (instance.child.exitCode === null && instance.child.signalCode === null) {
    instance.child.kill("SIGTERM")
  }
  return instance.closed
}

test("CLI diagnoses version conflicts and non-JSON occupied ports", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "pi-web-cli-test-"))
  const health = listenHealthServer()
  try {
    const port = await health.ready
    health.setResponse({
      status: 200,
      body: JSON.stringify({ name: "pi-web-codex", version: "0.0.0" }),
    })
    const mismatch = await runCli(port, path.join(temporary, "mismatch"))
    assert.equal(mismatch.code, 1)
    assert.match(
      mismatch.output,
      new RegExp(`already running at http://127\\.0\\.0\\.1:${port}`)
    )
    assert.match(mismatch.output, /Stop the existing instance before starting/)

    health.setResponse({ status: 500, body: "not JSON" })
    const occupied = await runCli(port, path.join(temporary, "occupied"))
    assert.equal(occupied.code, 1)
    assert.match(occupied.output, new RegExp(`Port ${port} is already in use`))

    for (const [name, contentType, body] of [
      ["html", "text/html", "<html>occupied</html>"],
      ["text", "text/plain", "occupied"],
      [
        "json",
        "application/json",
        JSON.stringify({ name: "other-service", version: "1.0.0" }),
      ],
    ]) {
      health.setResponse({ status: 200, contentType, body })
      const result = await runCli(port, path.join(temporary, name))
      assert.equal(result.code, 1)
      assert.match(result.output, new RegExp(`Port ${port} is already in use`))
    }

    health.setResponse({
      status: 200,
      body: JSON.stringify({
        name: "pi-web-codex",
        version: packageJson.version,
      }),
    })
    const sameVersion = await runCli(port, path.join(temporary, "same"))
    assert.equal(sameVersion.code, 0)
    assert.match(
      sameVersion.output,
      new RegExp(`pi-web-codex is ready at http://127\\.0\\.0\\.1:${port}`)
    )
  } finally {
    await new Promise((resolve) => health.server.close(resolve))
    await rm(temporary, { recursive: true, force: true })
  }
})

test("CLI explains malformed instance locks without deleting them", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "pi-web-cli-lock-test-"))
  let fixture
  try {
    fixture = await createCliFixture()
    for (const [name, contents] of [
      ["empty", ""],
      ["truncated", '{"pid":'],
      ["invalid-pid", JSON.stringify({ pid: "not-a-pid" })],
      ["invalid-pid-range", JSON.stringify({ pid: 2 ** 31 })],
    ]) {
      const configDir = path.join(temporary, name)
      const lockPath = path.join(configDir, "locks", "instance.lock")
      await mkdir(path.dirname(lockPath), { recursive: true })
      await writeFile(lockPath, contents)

      const result = await runCli(await freePort(), configDir, fixture.cli)
      assert.equal(result.code, 1)
      assert.ok(result.output.includes(lockPath))
      assert.match(result.output, /This lock records the PID/)
      assert.match(result.output, /Do not delete the config directory/)
      assert.match(
        result.output,
        /Only remove this lock file after confirming that no pi-web-codex instance is running/
      )
      assert.equal(await readFile(lockPath, "utf8"), contents)
    }

    const activeConfigDir = path.join(temporary, "active")
    const activeLockPath = path.join(activeConfigDir, "locks", "instance.lock")
    const activeContents = `${JSON.stringify({ pid: process.pid })}\n`
    await mkdir(path.dirname(activeLockPath), { recursive: true })
    await writeFile(activeLockPath, activeContents)
    const activeResult = await runCli(
      await freePort(),
      activeConfigDir,
      fixture.cli
    )
    assert.equal(activeResult.code, 1)
    assert.ok(activeResult.output.includes(activeLockPath))
    assert.match(activeResult.output, /already running \(PID/)
    assert.match(
      activeResult.output,
      /Do not delete or replace this lock while that process is running/
    )
    assert.equal(await readFile(activeLockPath, "utf8"), activeContents)

    const markerConfigDir = path.join(temporary, "orphaned-recovery")
    const markerLockPath = path.join(markerConfigDir, "locks", "instance.lock")
    const markerPath = `${markerLockPath}.recovery`
    await mkdir(path.dirname(markerLockPath), { recursive: true })
    await writeFile(markerLockPath, `${JSON.stringify({ pid: 99999999 })}\n`)
    await mkdir(markerPath)
    const markerResult = await runCli(
      await freePort(),
      markerConfigDir,
      fixture.cli
    )
    assert.equal(markerResult.code, 1)
    assert.ok(markerResult.output.includes(markerLockPath))
    assert.ok(markerResult.output.includes(markerPath))
    assert.match(markerResult.output, /recovery marker/)
    assert.match(
      markerResult.output,
      /Only remove this recovery marker after confirming that no pi-web-codex instance is running/
    )
    assert.equal(
      await readFile(markerLockPath, "utf8"),
      `${JSON.stringify({ pid: 99999999 })}\n`
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
    if (fixture) await rm(fixture.root, { recursive: true, force: true })
  }
})

test("CLI recovers a dead instance lock and serializes concurrent startup", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "pi-web-cli-lock-race-"))
  let fixture
  const configDir = path.join(temporary, "config")
  const lockDirectory = path.join(configDir, "locks")
  const lockPath = path.join(lockDirectory, "instance.lock")
  const instances = []
  try {
    fixture = await createCliFixture()
    try {
      await mkdir(lockDirectory, { recursive: true })
      await writeFile(lockPath, `${JSON.stringify({ pid: 99999999 })}\n`)

      const first = startCli(await freePort(), configDir, fixture.cli)
      const second = startCli(await freePort(), configDir, fixture.cli)
      instances.push(first, second)

      const observations = await Promise.allSettled([
        first.readyObserved,
        second.readyObserved,
      ])
      assert.equal(
        observations.filter((result) => result.status === "fulfilled").length,
        1,
        observations
          .map((result) =>
            result.status === "rejected" ? result.reason.message : result.status
          )
          .join("\n")
      )

      const owner = JSON.parse(await readFile(lockPath, "utf8"))
      assert.ok([first.child.pid, second.child.pid].includes(owner.pid))
      assert.equal(
        instances.filter(
          (instance) =>
            instance.child.exitCode === null &&
            instance.child.signalCode === null
        ).length,
        1
      )
      assert.equal(
        instances.filter((instance) => instance.child.pid === owner.pid).length,
        1
      )
      assert.deepEqual(await readdir(lockDirectory), ["instance.lock"])
    } finally {
      await Promise.all(instances.map((instance) => stopCli(instance)))
    }
    await assert.rejects(readFile(lockPath, "utf8"), { code: "ENOENT" })
  } finally {
    await rm(temporary, { recursive: true, force: true })
    if (fixture) await rm(fixture.root, { recursive: true, force: true })
  }
})
