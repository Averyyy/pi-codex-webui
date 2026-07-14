import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"

const run = promisify(execFile)
const root = process.cwd()
const temporary = await mkdtemp(path.join(tmpdir(), "pi-web-release-"))

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      assert.ok(address && typeof address === "object")
      server.close(() => resolve(address.port))
    })
  })
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = ""
    const timeout = setTimeout(
      () => reject(new Error(`Installed CLI did not become ready.\n${output}`)),
      20_000
    )
    const capture = (chunk) => {
      output += chunk.toString("utf8")
      if (!output.includes("pi-web-codex is ready at")) return
      clearTimeout(timeout)
      resolve()
    }
    child.stdout.on("data", capture)
    child.stderr.on("data", capture)
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timeout)
      reject(
        new Error(
          `Installed CLI exited before readiness (${signal ?? code ?? "unknown"}).\n${output}`
        )
      )
    })
  })
}

async function inspectTarball(tarball) {
  const required = new Set([
    "package/dist/app/apps/web/server.js",
    "package/dist/webui-extensions/conversation/dist/client.mjs",
    "package/dist/webui-extensions/conversation/dist/worker.mjs",
    "package/dist/workers/pi/dist/worker.mjs",
    "package/dist/workers/pi-client/dist/worker.mjs",
  ])
  let leakedSource
  let staticAssets = false
  let stderr = ""
  const tar = spawn("tar", ["-tf", tarball], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  tar.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")))
  const exited = new Promise((resolve, reject) => {
    tar.once("error", reject)
    tar.once("exit", (code) => resolve(code))
  })
  for await (const file of createInterface({ input: tar.stdout })) {
    if (/\.(?:ts|tsx)$/.test(file)) leakedSource ??= file
    required.delete(file)
    if (file.startsWith("package/dist/app/apps/web/.next/static/")) {
      staticAssets = true
    }
  }
  const code = await exited
  assert.equal(code, 0, stderr || "Could not inspect NPM tarball.")
  assert.equal(
    leakedSource,
    undefined,
    `NPM tarball contains TypeScript business source: ${leakedSource}`
  )
  assert.deepEqual([...required], [], `Missing release files: ${[...required]}`)
  assert.equal(
    staticAssets,
    true,
    "NPM tarball does not contain Next.js static assets."
  )
}

let child
try {
  const filename = (
    await run("npm", ["pack", "--silent", "--pack-destination", temporary], {
      cwd: root,
    })
  ).stdout.trim()
  assert.ok(filename.endsWith(".tgz"))
  const tarball = path.join(temporary, filename)
  await inspectTarball(tarball)

  const installRoot = path.join(temporary, "global")
  await run("npm", ["install", "--global", "--prefix", installRoot, tarball])
  const executable = path.join(
    installRoot,
    process.platform === "win32" ? "pi-web-codex.cmd" : "bin/pi-web-codex"
  )
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"))
  )
  assert.equal(
    (await run(executable, ["--version"])).stdout.trim(),
    packageJson.version
  )

  const port = await availablePort()
  const configRoot = path.join(temporary, "config")
  const agentRoot = path.join(temporary, "agent")
  await Promise.all([mkdir(configRoot), mkdir(agentRoot)])
  child = spawn(
    executable,
    ["--no-open", "--port", String(port), "--config-dir", configRoot],
    {
      env: { ...process.env, PI_CODING_AGENT_DIR: agentRoot },
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  await waitForReady(child)
  const health = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
  assert.equal(health.ok, true)
  assert.equal((await health.json()).name, "pi-web-codex")
  child.kill("SIGTERM")
  await new Promise((resolve) => child.once("exit", resolve))
  child = undefined

  console.log(`Release verified: ${filename}`)
} finally {
  if (child?.exitCode === null) child.kill("SIGTERM")
  await rm(temporary, { recursive: true, force: true })
}
