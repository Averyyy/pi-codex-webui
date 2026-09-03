import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { lstat, mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises"
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

async function requiredBuiltinReleaseFiles() {
  const builtinRoot = path.join(root, "webui-extensions", "builtin")
  const directories = await readdir(builtinRoot, { withFileTypes: true })
  const required = []
  for (const directory of directories) {
    if (!directory.isDirectory()) continue
    const packageJsonPath = path.join(
      builtinRoot,
      directory.name,
      "package.json"
    )
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"))
    const extensions = packageJson.piWebCodex?.extensions
    if (!Array.isArray(extensions)) continue
    required.push(
      path.posix.join(
        "package/dist/webui-extensions",
        directory.name,
        "package.json"
      )
    )
    for (const extension of extensions) {
      for (const key of ["worker", "client"]) {
        const asset = extension[key]
        assert.equal(
          typeof asset,
          "string",
          `${packageJsonPath} is missing ${key}.`
        )
        const relativeAsset = asset.replaceAll("\\", "/").replace(/^\.\//, "")
        assert.equal(
          path.posix.isAbsolute(relativeAsset) ||
            relativeAsset.split("/").includes(".."),
          false,
          `${packageJsonPath} has an invalid ${key} path: ${asset}`
        )
        required.push(
          path.posix.join(
            "package/dist/webui-extensions",
            directory.name,
            relativeAsset
          )
        )
      }
    }
  }
  return required
}

async function inspectTarball(tarball) {
  const required = new Set([
    "package/dist/app/apps/web/server.js",
    "package/extensions/pi-web-codex.ts",
    ...(await requiredBuiltinReleaseFiles()),
    "package/dist/workers/pi/dist/worker.mjs",
    "package/dist/workers/pi/node_modules/@earendil-works/pi-coding-agent/package.json",
    "package/dist/workers/pi-client/dist/worker.mjs",
    "package/dist/workers/pi-client/node_modules/@earendil-works/pi-coding-agent/package.json",
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
    if (/\.(?:ts|tsx)$/.test(file) && !file.startsWith("package/extensions/")) {
      leakedSource ??= file
    }
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

function installedPackageRoot(installRoot) {
  return path.join(
    installRoot,
    process.platform === "win32"
      ? "node_modules/pi-web-codex"
      : "lib/node_modules/pi-web-codex"
  )
}

async function assertRegularFile(file, label) {
  const stats = await lstat(file)
  assert.equal(stats.isSymbolicLink(), false, `${label} is a symlink: ${file}`)
  assert.equal(stats.isFile(), true, `${label} is missing: ${file}`)
}

async function assertProductionInstall(packageRoot) {
  const server = await readFile(
    path.join(packageRoot, "dist/app/apps/web/server.js"),
    "utf8"
  )
  assert.match(
    server,
    /process\.env\.NODE_ENV = ['"]production['"]/,
    "Installed server.js is not a Next.js production standalone entry."
  )
  assert.match(
    server,
    /isDev:\s*false/,
    "Installed server.js does not start Next.js in production mode."
  )
  await assertRegularFile(
    path.join(
      packageRoot,
      "dist/workers/pi/node_modules/@earendil-works/pi-coding-agent/package.json"
    ),
    "Pi worker SDK"
  )
  await assertRegularFile(
    path.join(
      packageRoot,
      "dist/workers/pi-client/node_modules/@earendil-works/pi-coding-agent/package.json"
    ),
    "Pi client worker SDK"
  )
  await assertRegularFile(
    path.join(packageRoot, "extensions/pi-web-codex.ts"),
    "Pi package extension"
  )
}

async function assertPageOk(url, pathname) {
  const response = await fetch(`${url}${pathname}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.text()
  assert.equal(
    response.ok,
    true,
    `${pathname} returned ${response.status}: ${body.slice(0, 500)}`
  )
  assert.equal(
    body.includes("__next_error__"),
    false,
    `${pathname} rendered the Next.js error page.`
  )
  assert.doesNotMatch(
    body,
    /Compiled (?:in|successfully)|Fast Refresh/i,
    `${pathname} looks like next dev, not next build.`
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
  const installedRoot = installedPackageRoot(installRoot)
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"))
  )
  assert.equal(
    (await run(executable, ["--version"])).stdout.trim(),
    packageJson.version
  )
  await assertProductionInstall(installedRoot)

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
  const url = `http://127.0.0.1:${port}`
  const health = await fetch(`${url}/api/v1/health`)
  assert.equal(health.ok, true)
  const healthBody = await health.json()
  assert.equal(healthBody.name, "pi-web-codex")
  assert.equal(healthBody.version, packageJson.version)
  await assertPageOk(url, "/")
  await assertPageOk(url, "/new")
  await assertPageOk(url, "/settings")
  child.kill("SIGTERM")
  await new Promise((resolve) => child.once("exit", resolve))
  child = undefined

  console.log(`Release verified: ${filename}`)
} finally {
  if (child?.exitCode === null) child.kill("SIGTERM")
  await rm(temporary, { recursive: true, force: true })
}
