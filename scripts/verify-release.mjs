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
const temporary = await mkdtemp(path.join(tmpdir(), "pi-web-release test-"))
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const requestedTarball =
  process.argv[2] ?? process.env.PI_WEB_CODEX_RELEASE_TARBALL

function quoteWindowsShellArg(value) {
  return `"${String(value)}"`
}

async function runCommand(command, args, options = {}) {
  if (process.platform === "win32" && command.toLowerCase().endsWith(".cmd")) {
    if (!path.isAbsolute(command)) {
      // Quoted bare batch names make cmd.exe expand %~dp0 from cwd, not PATH.
      const { stdout } = await run("where.exe", [command], options)
      command = stdout.trim().split(/\r?\n/)[0]
    }
    return run([command, ...args].map(quoteWindowsShellArg).join(" "), [], {
      ...options,
      shell: true,
      windowsVerbatimArguments: true,
    })
  }
  return run(command, args, {
    ...options,
  })
}

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
    "package/package.json",
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
  let currentNativeModule
  let currentSpawnHelper
  const currentPlatform = `${process.platform}-${process.arch}`
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
    if (
      new RegExp(
        `/node-pty(?:-[^/]+)?/prebuilds/${currentPlatform}/pty\\.node$`
      ).test(file)
    ) {
      currentNativeModule = file
    }
    if (
      new RegExp(
        `/node-pty(?:-[^/]+)?/prebuilds/${currentPlatform}/spawn-helper$`
      ).test(file)
    ) {
      currentSpawnHelper = file
    }
    if (
      process.platform === "linux" &&
      /\/node-pty(?:-[^/]+)?\/build\/Release\/pty\.node$/.test(file)
    ) {
      currentNativeModule = file
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
  assert.ok(
    currentNativeModule,
    `NPM tarball does not contain node-pty for ${process.platform}-${process.arch}.`
  )
  if (process.platform === "darwin") {
    assert.ok(
      currentSpawnHelper,
      `NPM tarball does not contain node-pty spawn-helper for ${process.platform}-${process.arch}.`
    )
  }
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

async function assertExecutableFile(file, label) {
  await assertRegularFile(file, label)
  const stats = await lstat(file)
  assert.notEqual(stats.mode & 0o111, 0, `${label} is not executable: ${file}`)
}

async function findNodePtyPackages(directory, packages = []) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const target = path.join(directory, entry.name)
    if (entry.name === "node-pty" || entry.name.startsWith("node-pty-")) {
      packages.push(target)
    }
    await findNodePtyPackages(target, packages)
  }
  return packages
}

async function assertNodePtyNative(packageRoot) {
  const candidates = await findNodePtyPackages(
    path.join(packageRoot, "dist", "app")
  )
  const nativeRelativePath =
    process.platform === "linux"
      ? path.join("build", "Release", "pty.node")
      : path.join(
          "prebuilds",
          `${process.platform}-${process.arch}`,
          "pty.node"
        )
  for (const candidate of candidates) {
    const nativeModule = path.join(candidate, nativeRelativePath)
    try {
      await assertRegularFile(nativeModule, "node-pty native module")
      if (process.platform === "darwin") {
        await assertExecutableFile(
          path.join(path.dirname(nativeModule), "spawn-helper"),
          "node-pty spawn-helper"
        )
      }
      return
    } catch (error) {
      if (
        error?.code !== "ENOENT" &&
        !(error instanceof assert.AssertionError)
      ) {
        throw error
      }
    }
  }
  assert.fail(
    `Installed package does not contain node-pty for ${process.platform}-${process.arch}.`
  )
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
  await assertNodePtyNative(packageRoot)
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

async function expectOk(response, label) {
  const body = await response.text()
  assert.equal(
    response.ok,
    true,
    `${label} returned ${response.status}: ${body.slice(0, 500)}`
  )
  return body
}

async function readSseUntil(reader, marker) {
  let output = ""
  const decoder = new TextDecoder()
  while (true) {
    let timer
    try {
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`Timed out waiting for terminal output: ${marker}`)
              ),
            10_000
          )
        }),
      ])
      if (timer) clearTimeout(timer)
      if (result.done) break
      output += decoder.decode(result.value, { stream: true })
      if (output.includes(marker)) return output
    } catch (error) {
      if (timer) clearTimeout(timer)
      throw error
    }
  }
  throw new Error(`Terminal stream ended before output: ${marker}`)
}

async function assertTaskTerminal(url, mutationHeaders, packageVersion) {
  const taskResponse = await fetch(`${url}/api/v1/tasks`, {
    method: "POST",
    headers: mutationHeaders,
    body: "{}",
  })
  const task = JSON.parse(await expectOk(taskResponse, "Task creation"))
  assert.equal(
    typeof task.sessionId,
    "string",
    "Task response has no session ID."
  )
  assert.equal(
    task.snapshot?.webSessionId,
    task.sessionId,
    "Task response does not contain a ready worker snapshot."
  )

  const endpoint = `${url}/api/v1/sessions/${task.sessionId}/terminal`
  console.log("Pi task ready; starting native terminal...")
  let reader
  try {
    const startResponse = await fetch(endpoint, {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({ action: "start", columns: 80, rows: 24 }),
    })
    await expectOk(startResponse, "Terminal start")
    console.log("Native terminal started; opening output stream...")

    const streamResponse = await fetch(endpoint)
    assert.equal(
      streamResponse.ok,
      true,
      `Terminal stream returned ${streamResponse.status}.`
    )
    assert.ok(streamResponse.body, "Terminal stream has no response body.")
    reader = streamResponse.body.getReader()
    await readSseUntil(reader, "event: snapshot")
    console.log("Terminal stream ready; executing output probe...")

    const markerPrefix = `pi-web-codex-release-terminal-${packageVersion}-${Date.now()}`
    const marker = `${markerPrefix}-output`
    const inputResponse = await fetch(endpoint, {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        action: "input",
        data: `"${process.execPath}" -e "console.log('${markerPrefix}' + '-output')"\r`,
      }),
    })
    await expectOk(inputResponse, "Terminal input")
    const output = await readSseUntil(reader, marker)
    assert.match(output, new RegExp(marker))
  } finally {
    console.log("Closing terminal stream and task...")
    if (reader) await reader.cancel().catch(() => undefined)
    const stopResponse = await fetch(endpoint, {
      method: "DELETE",
      headers: mutationHeaders,
    })
    await expectOk(stopResponse, "Terminal cleanup")

    const archiveResponse = await fetch(
      `${url}/api/v1/sessions/${task.sessionId}/archive`,
      {
        method: "POST",
        headers: mutationHeaders,
      }
    )
    await expectOk(archiveResponse, "Task cleanup")

    const deleteResponse = await fetch(
      `${url}/api/v1/sessions/${task.sessionId}`,
      {
        method: "DELETE",
        headers: mutationHeaders,
      }
    )
    await expectOk(deleteResponse, "Task deletion")
  }
}

async function assertPiClientTask(url, mutationHeaders) {
  const runtimesResponse = await fetch(`${url}/api/v1/runtimes`)
  const runtimes = JSON.parse(await expectOk(runtimesResponse, "Runtime list"))
  const profile = runtimes.profiles?.find(
    (candidate) => candidate.id === "pi-client-default"
  )
  assert.equal(
    profile?.kind,
    "pi-client",
    "Installed package does not expose the Pi Client runtime profile."
  )
  assert.equal(
    typeof runtimes.revision,
    "number",
    "Runtime list has no configuration revision."
  )

  const patchResponse = await fetch(
    `${url}/api/v1/runtimes/pi-client-default`,
    {
      method: "PATCH",
      headers: {
        ...mutationHeaders,
        "If-Match": `"revision-${runtimes.revision}"`,
      },
      body: JSON.stringify({
        enabled: true,
        serverUrl: "http://127.0.0.1:9",
        defaultProfileId: "pi",
      }),
    }
  )
  const patched = JSON.parse(
    await expectOk(patchResponse, "Pi Client settings")
  )
  const patchedProfile = patched.profiles?.find(
    (candidate) => candidate.id === "pi-client-default"
  )
  assert.equal(patchedProfile?.enabled, true)

  const taskResponse = await fetch(`${url}/api/v1/tasks`, {
    method: "POST",
    headers: mutationHeaders,
    body: JSON.stringify({ runtimeProfileId: "pi-client-default" }),
  })
  const task = JSON.parse(await expectOk(taskResponse, "Pi Client task"))
  assert.equal(
    typeof task.sessionId,
    "string",
    "Pi Client task has no session ID."
  )
  assert.equal(
    task.snapshot?.webSessionId,
    task.sessionId,
    "Pi Client task did not initialize a worker snapshot."
  )

  const sessionId = task.sessionId
  console.log("Pi Client task ready; checking session and cleanup...")
  const sessionResponse = await fetch(`${url}/api/v1/sessions/${sessionId}`)
  const session = JSON.parse(
    await expectOk(sessionResponse, "Pi Client session")
  )
  assert.equal(session.session?.runtimeKind, "pi-client")
  assert.equal(session.session?.runtimeProfileId, "pi-client-default")
  const archiveResponse = await fetch(
    `${url}/api/v1/sessions/${sessionId}/archive`,
    { method: "POST", headers: mutationHeaders }
  )
  await expectOk(archiveResponse, "Pi Client task cleanup")
  const deleteResponse = await fetch(`${url}/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
    headers: mutationHeaders,
  })
  await expectOk(deleteResponse, "Pi Client task deletion")
}

async function stopProcessTree(processHandle) {
  const hasExited = () =>
    processHandle.exitCode !== null || processHandle.signalCode !== null
  if (!processHandle || hasExited()) return
  if (process.platform === "win32") {
    try {
      await runCommand(
        "taskkill.exe",
        ["/pid", String(processHandle.pid), "/t", "/f"],
        { windowsHide: true }
      )
    } catch (error) {
      if (!hasExited()) throw error
    }
  } else {
    if (!processHandle.kill("SIGTERM") && !hasExited()) {
      throw new Error(
        `Could not stop installed CLI (PID ${processHandle.pid}).`
      )
    }
  }
  try {
    await new Promise((resolve, reject) => {
      if (hasExited()) {
        resolve()
        return
      }
      const timeout = setTimeout(
        () =>
          reject(
            new Error(`Installed CLI did not exit (PID ${processHandle.pid}).`)
          ),
        5_000
      )
      processHandle.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
    return
  } catch (error) {
    if (process.platform === "win32" || hasExited()) throw error
    if (!processHandle.kill("SIGKILL") && !hasExited()) throw error
    await new Promise((resolve, reject) => {
      if (hasExited()) {
        resolve()
        return
      }
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Installed CLI remained alive after forced termination (PID ${processHandle.pid}).`
            )
          ),
        2_000
      )
      processHandle.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
    throw error
  }
}

let child
try {
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8")
  )
  let filename
  let tarball
  if (requestedTarball) {
    tarball = path.resolve(root, requestedTarball)
    const stats = await lstat(tarball)
    if (stats.isDirectory()) {
      const candidates = (await readdir(tarball)).filter((file) =>
        file.endsWith(".tgz")
      )
      assert.equal(
        candidates.length,
        1,
        `Expected exactly one .tgz file in ${tarball}.`
      )
      filename = candidates[0]
      tarball = path.join(tarball, filename)
    } else {
      filename = path.basename(tarball)
    }
  } else {
    filename = (
      await runCommand(
        npmCommand,
        ["pack", "--silent", "--pack-destination", temporary],
        { cwd: root }
      )
    ).stdout.trim()
    tarball = path.join(temporary, filename)
  }
  assert.ok(filename.endsWith(".tgz"))
  console.log(`Inspecting release artifact: ${filename}`)
  await inspectTarball(tarball)

  const installRoot = path.join(temporary, "global")
  console.log("Installing release into an isolated global prefix...")
  await runCommand(npmCommand, [
    "install",
    "--global",
    "--prefix",
    installRoot,
    tarball,
  ])
  const executable = path.join(
    installRoot,
    process.platform === "win32" ? "pi-web-codex.cmd" : "bin/pi-web-codex"
  )
  const installedRoot = installedPackageRoot(installRoot)
  console.log("Checking installed CLI shim and production assets...")
  assert.equal(
    (await runCommand(executable, ["--version"])).stdout.trim(),
    packageJson.version
  )
  await assertProductionInstall(installedRoot)

  const port = await availablePort()
  const configRoot = path.join(temporary, "config")
  const agentRoot = path.join(temporary, "agent")
  await Promise.all([mkdir(configRoot), mkdir(agentRoot)])
  const mutationToken = "pi-web-codex-release-verify"
  const cliScript = path.join(installedRoot, "bin", "pi-web-codex.mjs")
  const startupCommand =
    process.platform === "win32" ? process.execPath : executable
  const startupArgs =
    process.platform === "win32"
      ? [
          cliScript,
          "--no-open",
          "--port",
          String(port),
          "--config-dir",
          configRoot,
        ]
      : ["--no-open", "--port", String(port), "--config-dir", configRoot]
  child = spawn(startupCommand, startupArgs, {
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: agentRoot,
      PI_WEB_CODEX_MUTATION_TOKEN: mutationToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  console.log("Starting installed host...")
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
  const mutationHeaders = {
    "Content-Type": "application/json",
    Origin: url,
    "X-Pi-Web-Codex-Mutation-Token": mutationToken,
  }
  console.log("Checking Pi worker and terminal command output...")
  await assertTaskTerminal(url, mutationHeaders, packageJson.version)
  console.log("Checking Pi Client worker...")
  await assertPiClientTask(url, mutationHeaders)
  console.log("Stopping installed host...")
  await stopProcessTree(child)
  child = undefined

  console.log(`Release verified: ${filename}`)
} finally {
  await stopProcessTree(child)
  console.log("Removing isolated release installation...")
  await rm(temporary, { recursive: true, force: true })
}
