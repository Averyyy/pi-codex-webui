import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { constants } from "node:fs"
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"
import path from "node:path"

export const APP_NAME = "pi-web-codex"
export const OFFICIAL_REGISTRY = "https://registry.npmjs.org"
export const METADATA_TTL_MS = 30 * 60 * 1000
export const NPM_METADATA_OPERATION_TIMEOUT_MS = 30_000
export const NPM_PACKAGE_OPERATION_TIMEOUT_MS = 10 * 60 * 1000
export const NPM_STRUCTURED_OUTPUT_MAX_BYTES = 16 * 1024 * 1024
export const REQUIRED_RUNTIME_FILES = [
  "bin/pi-web-codex.mjs",
  "dist/app/apps/web/server.js",
  "dist/workers/pi/dist/worker.mjs",
  "dist/workers/pi-client/dist/worker.mjs",
  "dist/webui-extensions",
]

const UPDATE_TIMEOUT_MS = 10_000
const HEALTH_ATTEMPTS = 100
const HEALTH_INTERVAL_MS = 100
const CHILD_STOP_TIMEOUT_MS = 2_000
const MAX_BODY_BYTES = 64 * 1024

function toError(error) {
  return error instanceof Error ? error : new Error(String(error))
}

function sanitizeDiagnostic(value) {
  return String(value).replace(
    /(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi,
    "$1[redacted]@"
  )
}

export function npmOperationTimeout(args) {
  return args.some((argument) =>
    ["install", "pack", "uninstall"].includes(argument)
  )
    ? NPM_PACKAGE_OPERATION_TIMEOUT_MS
    : NPM_METADATA_OPERATION_TIMEOUT_MS
}

function pathKey(value) {
  const resolved = path.resolve(value)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function isWithin(parent, child) {
  const parentKey = pathKey(parent)
  const childKey = pathKey(child)
  return (
    childKey === parentKey || childKey.startsWith(`${parentKey}${path.sep}`)
  )
}

function parseSemver(version) {
  if (typeof version !== "string") return null
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version
    )
  if (!match) return null
  const prerelease = match[4]
    ? match[4].split(".").map((part) => {
        if (/^\d+$/.test(part) && part.length > 1 && part.startsWith("0")) {
          return null
        }
        return /^\d+$/.test(part) ? BigInt(part) : part
      })
    : []
  if (prerelease.some((part) => part === null)) return null
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
    build: match[5] ?? "",
  }
}

export function isValidSemver(version) {
  return parseSemver(version) !== null
}

export function isStableVersion(version) {
  const parsed = parseSemver(version)
  return Boolean(parsed && parsed.prerelease.length === 0)
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (index >= left.length) return -1
    if (index >= right.length) return 1
    const a = left[index]
    const b = right[index]
    if (a === b) continue
    if (typeof a === "bigint" && typeof b === "bigint") {
      return a < b ? -1 : 1
    }
    if (typeof a === "bigint") return -1
    if (typeof b === "bigint") return 1
    return a < b ? -1 : 1
  }
  return 0
}

export function compareSemver(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (!a || !b) {
    throw new Error(
      `Cannot compare invalid semantic versions: ${left} and ${right}.`
    )
  }
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

function assertStable(version, label) {
  if (!isStableVersion(version)) {
    throw new Error(
      `${label} must be a stable full semantic version, received ${String(version)}.`
    )
  }
  return version
}

function updatesRoot(configRoot) {
  return path.join(configRoot, "updates")
}

function metadataPath(configRoot) {
  return path.join(updatesRoot(configRoot), "metadata.json")
}

export function getRuntimeServerPath(runtimeRoot) {
  return path.join(runtimeRoot, "dist", "app", "apps", "web", "server.js")
}

export function getRuntimeCliPath(runtimeRoot) {
  return path.join(runtimeRoot, "bin", "pi-web-codex.mjs")
}

async function readPackageJson(runtimeRoot) {
  return JSON.parse(
    await readFile(path.join(runtimeRoot, "package.json"), "utf8")
  )
}

async function readRuntimeVersion(runtimeRoot) {
  const packageJson = await readPackageJson(runtimeRoot)
  if (packageJson.name !== APP_NAME) {
    throw new Error(
      `Runtime package at ${runtimeRoot} is ${String(packageJson.name)}, expected ${APP_NAME}.`
    )
  }
  return assertStable(
    packageJson.version,
    `Runtime package at ${runtimeRoot} version`
  )
}

async function verifyRequiredFiles(runtimeRoot) {
  for (const relative of REQUIRED_RUNTIME_FILES) {
    const target = path.resolve(runtimeRoot, relative)
    if (!isWithin(runtimeRoot, target)) {
      throw new Error(`Runtime file escapes package root: ${relative}.`)
    }
    await access(target, constants.R_OK)
    if (relative === "dist/webui-extensions") {
      const info = await stat(target)
      if (!info.isDirectory()) {
        throw new Error("Runtime webui-extensions path is not a directory.")
      }
    }
  }
}

export async function verifyInstalledRuntime(runtimeRoot, expectedVersion) {
  const resolvedRoot = path.resolve(runtimeRoot)
  const packageJson = await readPackageJson(resolvedRoot)
  if (packageJson.name !== APP_NAME) {
    throw new Error(
      `Runtime package at ${resolvedRoot} is ${String(packageJson.name)}, expected ${APP_NAME}.`
    )
  }
  const version = assertStable(
    packageJson.version,
    `Runtime package at ${resolvedRoot} version`
  )
  if (expectedVersion !== undefined && version !== expectedVersion) {
    throw new Error(
      `Runtime package at ${resolvedRoot} reports ${version}, expected ${expectedVersion}.`
    )
  }
  const binValue =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.[APP_NAME]
  if (typeof binValue !== "string") {
    throw new Error(
      `Runtime package at ${resolvedRoot} does not declare the ${APP_NAME} CLI.`
    )
  }
  const binPath = path.resolve(resolvedRoot, binValue)
  if (!isWithin(resolvedRoot, binPath)) {
    throw new Error(`Runtime CLI path escapes package root: ${binValue}.`)
  }
  await verifyRequiredFiles(resolvedRoot)
  return {
    root: resolvedRoot,
    version,
    cliPath: binPath,
    serverPath: getRuntimeServerPath(resolvedRoot),
  }
}

function samePath(left, right) {
  return pathKey(left) === pathKey(right)
}

/**
 * The process that owns the service is always the canonical package install
 * that invoked this CLI. Updates replace that install after a staged package
 * has passed validation; no second active pointer is consulted at startup.
 */
export async function resolveActiveRuntime(_configRoot, fallbackRoot) {
  const fallback = path.resolve(fallbackRoot)
  const version = await readRuntimeVersion(fallback)
  return {
    root: fallback,
    version,
    pointer: null,
    delegated: false,
    cliPath: getRuntimeCliPath(fallback),
    serverPath: getRuntimeServerPath(fallback),
  }
}

function jsonResponse(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  })
  response.end(payload)
}

async function readRequestBody(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.")
    chunks.push(chunk)
  }
  if (size === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new Error("Request body must be valid JSON.")
  }
}

function hasBearer(request, token) {
  const authorization = request.headers.authorization
  const expected = `Bearer ${token}`
  if (typeof authorization !== "string") return false
  const received = Buffer.from(authorization)
  const wanted = Buffer.from(expected)
  return received.length === wanted.length && timingSafeEqual(received, wanted)
}

async function fetchWithTimeout(
  fetchImpl,
  url,
  options = {},
  timeoutMs = UPDATE_TIMEOUT_MS
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchJsonWithTimeout(
  fetchImpl,
  url,
  options = {},
  timeoutMs = UPDATE_TIMEOUT_MS
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    })
    const body = await response.json()
    return { response, body }
  } finally {
    clearTimeout(timeout)
  }
}

async function readHealth(fetchImpl, url) {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${url}/api/v1/health`,
      {},
      500
    )
    if (!response.ok) return null
    const body = await response.json()
    return body?.name === APP_NAME ? body : null
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

async function waitForHealth(
  fetchImpl,
  url,
  child,
  version,
  {
    attempts = HEALTH_ATTEMPTS,
    intervalMs = HEALTH_INTERVAL_MS,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {}
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child.exitCode !== null && child.exitCode !== undefined) {
      throw new Error(
        `Next.js exited before becoming healthy (${child.exitCode}).`
      )
    }
    if (child.signalCode) {
      throw new Error(
        `Next.js exited before becoming healthy (${child.signalCode}).`
      )
    }
    const health = await readHealth(fetchImpl, url)
    if (health && health.version === version) return health
    await sleep(intervalMs)
  }
  throw new Error(
    `Timed out waiting for ${url}/api/v1/health at version ${version}.`
  )
}

async function waitForChildExit(child, timeoutMs) {
  if (childHasExited(child)) return
  await new Promise((resolve) => {
    let timer
    const done = () => {
      if (timer) clearTimeout(timer)
      child.off?.("exit", done)
      child.off?.("close", done)
      resolve()
    }
    child.once("exit", done)
    child.once("close", done)
    timer = setTimeout(done, timeoutMs)
  })
}

function childHasExited(child) {
  return Boolean(
    (child.exitCode !== null && child.exitCode !== undefined) ||
    (child.signalCode !== null && child.signalCode !== undefined)
  )
}

function signalChild(child, signal, processGroup) {
  if (
    processGroup &&
    process.platform !== "win32" &&
    Number.isSafeInteger(child.pid)
  ) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch (error) {
      if (error?.code !== "ESRCH") throw error
    }
  }
  child.kill(signal)
}

async function terminateChildBounded(child, { processGroup = false } = {}) {
  if (childHasExited(child)) return true
  try {
    signalChild(child, "SIGTERM", processGroup)
  } catch (error) {
    if (error?.code !== "ESRCH") throw error
  }
  await waitForChildExit(child, CHILD_STOP_TIMEOUT_MS)
  if (childHasExited(child)) return true
  if (process.platform === "win32" && Number.isSafeInteger(child.pid)) {
    await terminateWindowsTree(child.pid)
    await waitForChildExit(child, CHILD_STOP_TIMEOUT_MS)
    return childHasExited(child)
  }
  try {
    signalChild(child, "SIGKILL", processGroup)
  } catch (error) {
    if (error?.code !== "ESRCH") throw error
  }
  await waitForChildExit(child, CHILD_STOP_TIMEOUT_MS)
  return childHasExited(child)
}

async function terminateWindowsTree(pid) {
  await new Promise((resolve, reject) => {
    const killer = spawn(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", `taskkill /PID ${pid} /T /F`],
      { stdio: "ignore", windowsHide: true, shell: false }
    )
    killer.once("error", reject)
    killer.once("close", (code) => {
      if (code === 0 || code === 128 || code === 255) resolve()
      else
        reject(
          new Error(
            `taskkill could not terminate runtime process tree rooted at PID ${pid}.`
          )
        )
    })
  })
}

async function stopChild(child) {
  if (!child || childHasExited(child)) return
  if (!(await terminateChildBounded(child, { processGroup: true }))) {
    throw new Error(
      "Child process remained alive after graceful and forced shutdown."
    )
  }
}

async function atomicWriteJson(target, value) {
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

async function packageInstallRoot(stageRoot) {
  const installedRoot = path.join(stageRoot, "node_modules", APP_NAME)
  await access(path.join(installedRoot, "package.json"), constants.R_OK)
  return installedRoot
}

function npmInvocation() {
  const explicitCli = process.env.PI_WEB_CODEX_NPM_CLI
  if (explicitCli) {
    return { command: process.execPath, args: [verifyNpmCliPath(explicitCli)] }
  }
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath) {
    try {
      return {
        command: process.execPath,
        args: [verifyNpmCliPath(npmExecPath)],
      }
    } catch {
      // npm_execpath can belong to pnpm/yarn while this package still needs
      // npm's own CLI for global package identity and tarball semantics.
    }
  }
  if (process.platform === "win32") {
    const executableDirectory = path.dirname(process.execPath)
    const candidates = [
      path.join(
        executableDirectory,
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js"
      ),
      path.join(
        path.dirname(executableDirectory),
        "lib",
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js"
      ),
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return {
          command: process.execPath,
          args: [verifyNpmCliPath(candidate)],
        }
      }
    }
    throw new Error(
      "Could not resolve a verified npm CLI JavaScript entry on Windows. Set PI_WEB_CODEX_NPM_CLI to npm-cli.js."
    )
  }
  return {
    command: "npm",
    args: [],
  }
}

function verifyNpmCliPath(candidate) {
  const resolved = path.resolve(candidate)
  if (!existsSync(resolved) || !/\.c?js$/i.test(resolved)) {
    throw new Error(
      `Configured npm CLI is not a readable JavaScript file: ${candidate}.`
    )
  }
  let packagePath = path.dirname(resolved)
  for (;;) {
    const manifestPath = path.join(packagePath, "package.json")
    if (existsSync(manifestPath)) {
      let manifest
      try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
      } catch {
        throw new Error(
          `Configured npm CLI has an unreadable package manifest: ${manifestPath}.`
        )
      }
      if (manifest.name !== "npm") {
        throw new Error(`Configured npm CLI is not npm: ${manifestPath}.`)
      }
      return resolved
    }
    const parent = path.dirname(packagePath)
    if (parent === packagePath) break
    packagePath = parent
  }
  throw new Error(
    `Configured npm CLI is not inside an npm package: ${candidate}.`
  )
}

async function runNpmCommand(args, options = {}, spawnImpl = spawn) {
  const invocation = npmInvocation()
  const { timeoutMs: requestedTimeoutMs, signal, ...spawnOptions } = options
  const timeoutMs = requestedTimeoutMs ?? npmOperationTimeout(args)
  const structuredOutput = args.includes("--json")
  const maxStdoutBytes = structuredOutput
    ? NPM_STRUCTURED_OUTPUT_MAX_BYTES
    : 32_000
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new Error(
          "npm command cancelled because the supervisor is shutting down."
        )
      )
      return
    }
    let settled = false
    let terminating = false
    let stdoutOverflow = false
    let timeout
    const child = spawnImpl(invocation.command, [...invocation.args, ...args], {
      ...spawnOptions,
      stdio: spawnOptions.stdio ?? ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      if (stdoutOverflow) return
      stdout += chunk.toString()
      if (Buffer.byteLength(stdout) > maxStdoutBytes) {
        stdoutOverflow = true
        stdout = ""
      }
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 32_000) stderr = stderr.slice(-32_000)
    })
    const fail = (error) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
      reject(error)
    }
    const succeed = (value) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
      resolve(value)
    }
    const abort = () => {
      void terminateAndFail(
        new Error(
          "npm command cancelled because the supervisor is shutting down."
        )
      )
    }
    const terminateAndFail = async (error) => {
      if (settled || terminating) return
      terminating = true
      let stopped = false
      try {
        stopped = await terminateChildBounded(child)
      } catch (terminationError) {
        error.message += ` Child shutdown failed: ${toError(terminationError).message}`
      }
      if (!stopped) {
        error.npmProcessStillRunning = true
        error.message +=
          " The npm child process did not exit; rollback is blocked to avoid concurrent package mutation."
      }
      fail(error)
    }
    signal?.addEventListener("abort", abort, { once: true })
    child.once("error", (error) => {
      if (!terminating) fail(error)
    })
    child.once("close", (code, signal) => {
      if (terminating) return
      if (stdoutOverflow) {
        fail(
          new Error(
            `npm ${sanitizeDiagnostic(args.join(" "))} produced more than ${maxStdoutBytes} bytes of structured output.`
          )
        )
        return
      }
      if (code === 0) succeed({ stdout, stderr })
      else {
        const detail = stderr.trim() || stdout.trim()
        fail(
          new Error(
            `npm ${sanitizeDiagnostic(args.join(" "))} failed with ${signal ?? `exit code ${code}`}${
              detail ? `: ${sanitizeDiagnostic(detail)}` : ""
            }`
          )
        )
      }
    })
    timeout = setTimeout(() => {
      void terminateAndFail(
        new Error(`npm command timed out after ${timeoutMs}ms.`)
      )
    }, timeoutMs)
    timeout.unref?.()
  })
}

export { runNpmCommand }

async function readSinglePath(output, label) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length !== 1 || !path.isAbsolute(lines[0])) {
    throw new Error(`npm ${label} returned an invalid path.`)
  }
  return path.resolve(lines[0])
}

export async function resolveCanonicalGlobal({
  spawnImpl = spawn,
  npmCommand = runNpmCommand,
  env = process.env,
} = {}) {
  const explicitRoot = env.PI_WEB_CODEX_GLOBAL_ROOT
  if (explicitRoot) {
    const root = path.resolve(explicitRoot)
    if (!env.PI_WEB_CODEX_GLOBAL_PREFIX) {
      throw new Error(
        "PI_WEB_CODEX_GLOBAL_ROOT requires PI_WEB_CODEX_GLOBAL_PREFIX so the canonical npm installation can be verified."
      )
    }
    const prefix = path.resolve(env.PI_WEB_CODEX_GLOBAL_PREFIX)
    const rootOutput = await npmCommand(
      ["root", "--global", "--prefix", prefix, "--silent"],
      {},
      spawnImpl
    )
    const verifiedRoot = await readSinglePath(
      rootOutput.stdout,
      "root --global --prefix"
    )
    if (!samePath(root, verifiedRoot)) {
      throw new Error(
        `Configured global root ${root} does not match npm root ${verifiedRoot} for prefix ${prefix}.`
      )
    }
    return {
      root,
      prefix,
      packageRoot: path.join(root, APP_NAME),
      explicit: true,
    }
  }
  const rootOutput = await npmCommand(
    ["root", "--global", "--silent"],
    {},
    spawnImpl
  )
  const root = await readSinglePath(rootOutput.stdout, "root --global")
  const prefixOutput = await npmCommand(
    ["prefix", "--global", "--silent"],
    {},
    spawnImpl
  )
  const prefix = await readSinglePath(prefixOutput.stdout, "prefix --global")
  const verifiedRootOutput = await npmCommand(
    ["root", "--global", "--prefix", prefix, "--silent"],
    {},
    spawnImpl
  )
  const verifiedRoot = await readSinglePath(
    verifiedRootOutput.stdout,
    "root --global --prefix"
  )
  if (!samePath(root, verifiedRoot)) {
    throw new Error(
      `npm global root changed between resolution calls: ${root} vs ${verifiedRoot}.`
    )
  }
  return {
    root,
    prefix,
    packageRoot: path.join(root, APP_NAME),
    explicit: false,
  }
}

async function runNpmPack(runtimeRoot, destination, spawnImpl = spawn, signal) {
  await mkdir(destination, { recursive: true, mode: 0o700 })
  const output = await runNpmCommand(
    [
      "pack",
      "--ignore-scripts",
      "--silent",
      "--pack-destination",
      destination,
      runtimeRoot,
    ],
    {
      cwd: destination,
      signal,
      timeoutMs: NPM_PACKAGE_OPERATION_TIMEOUT_MS,
    },
    spawnImpl
  )
  const filenames = output.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (filenames.length !== 1 || !filenames[0].toLowerCase().endsWith(".tgz")) {
    throw new Error(
      "npm pack did not return exactly one safe .tgz filename; refusing to guess a rollback tarball."
    )
  }
  const tarball = path.resolve(destination, filenames[0])
  if (
    !isWithin(destination, tarball) ||
    path.basename(tarball) !== filenames[0]
  ) {
    throw new Error(
      "npm pack returned a tarball outside the rollback directory."
    )
  }
  await access(tarball, constants.R_OK)
  return tarball
}

async function runNpmInstallGlobal(tarball, prefix, spawnImpl = spawn, signal) {
  const args = [
    "install",
    "--global",
    "--force",
    "--ignore-scripts",
    "--omit=peer",
    "--no-audit",
    "--no-fund",
  ]
  if (prefix) args.push("--prefix", prefix)
  args.push(tarball)
  await runNpmCommand(
    args,
    {
      cwd: path.dirname(tarball),
      signal,
      timeoutMs: NPM_PACKAGE_OPERATION_TIMEOUT_MS,
    },
    spawnImpl
  )
}

async function runNpmUninstallGlobal(prefix, spawnImpl = spawn, signal) {
  const args = ["uninstall", "--global", "--force", APP_NAME]
  if (prefix) args.splice(3, 0, "--prefix", prefix)
  await runNpmCommand(args, { signal }, spawnImpl)
}

async function runCliVersion(
  cliPath,
  configRoot,
  expectedVersion,
  spawnImpl = spawn,
  signal
) {
  await mkdir(configRoot, { recursive: true, mode: 0o700 })
  const output = await new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new Error(
          "CLI version check cancelled because the supervisor is shutting down."
        )
      )
      return
    }
    const child = spawnImpl(
      process.execPath,
      [cliPath, "--version", "--config-dir", configRoot],
      {
        cwd: path.dirname(cliPath),
        env: { ...process.env, PI_WEB_CODEX_CONFIG_DIR: configRoot },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: false,
      }
    )
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()))
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()))
    child.once("error", reject)
    const abort = () => {
      try {
        child.kill("SIGTERM")
      } catch {
        // The close event carries the final state where available.
      }
      reject(
        new Error(
          "CLI version check cancelled because the supervisor is shutting down."
        )
      )
    }
    signal?.addEventListener("abort", abort, { once: true })
    child.once("close", (code) => {
      signal?.removeEventListener("abort", abort)
      if (code !== 0)
        reject(
          new Error(
            `CLI --version failed with exit code ${code}: ${stderr.trim()}`
          )
        )
      else resolve(stdout.trim())
    })
  })
  if (output !== expectedVersion) {
    throw new Error(
      `CLI reports ${output || "no version"}, expected ${expectedVersion}.`
    )
  }
  return output
}

async function runNpmInstall(stageRoot, version, registry, spawnImpl, signal) {
  const args = [
    "install",
    "--prefix",
    stageRoot,
    "--no-save",
    "--no-package-lock",
    "--ignore-scripts",
    "--omit=dev",
    "--omit=peer",
    "--no-audit",
    "--no-fund",
    "--registry",
    registry,
    `${APP_NAME}@${version}`,
  ]
  await runNpmCommand(
    args,
    {
      cwd: stageRoot,
      env: { ...process.env, npm_config_registry: registry },
      signal,
      timeoutMs: NPM_PACKAGE_OPERATION_TIMEOUT_MS,
    },
    spawnImpl
  )
}

async function backupConfig(configRoot, backupRoot) {
  await mkdir(backupRoot, { recursive: true, mode: 0o700 })
  const result = { database: false, config: false }
  const configPath = path.join(configRoot, "config.json")
  const configBackup = path.join(backupRoot, "config.json")
  try {
    await copyFile(configPath, configBackup)
    result.config = true
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }

  const databasePath = path.join(configRoot, "state.db")
  const databaseBackup = path.join(backupRoot, "state.db")
  try {
    await access(databasePath, constants.R_OK)
  } catch (error) {
    if (error?.code === "ENOENT") return result
    throw error
  }

  const database = new DatabaseSync(databasePath)
  try {
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    const escaped = databaseBackup.replaceAll("'", "''")
    database.exec(`VACUUM INTO '${escaped}'`)
  } finally {
    database.close()
  }
  result.database = true
  return result
}

async function restoreConfig(configRoot, backupRoot, backup) {
  if (backup.database) {
    for (const suffix of ["-wal", "-shm"]) {
      await rm(path.join(configRoot, `state.db${suffix}`), { force: true })
    }
    await copyFile(
      path.join(backupRoot, "state.db"),
      path.join(configRoot, "state.db")
    )
  }
  if (backup.config) {
    await copyFile(
      path.join(backupRoot, "config.json"),
      path.join(configRoot, "config.json")
    )
  }
}

async function getMutationToken(configRoot) {
  if (process.env.PI_WEB_CODEX_MUTATION_TOKEN)
    return process.env.PI_WEB_CODEX_MUTATION_TOKEN
  const secretRoot = path.join(configRoot, "secrets")
  const tokenPath = path.join(secretRoot, "mutation-token")
  try {
    const token = (await readFile(tokenPath, "utf8")).trim()
    if (token) {
      process.env.PI_WEB_CODEX_MUTATION_TOKEN = token
      return token
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }
  const token = randomBytes(32).toString("base64url")
  await mkdir(secretRoot, { recursive: true, mode: 0o700 })
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600 })
  process.env.PI_WEB_CODEX_MUTATION_TOKEN = token
  return token
}

function snapshotFrom(supervisor) {
  return {
    supported: supervisor.supported,
    currentVersion: supervisor.currentVersion,
    latestVersion: supervisor.latestVersion,
    available:
      Boolean(supervisor.latestVersion) &&
      compareSemver(supervisor.latestVersion, supervisor.currentVersion) > 0,
    phase: supervisor.phase,
    error: supervisor.error,
    operationId: supervisor.operationId,
  }
}

export class UpdateSupervisor {
  constructor({
    configRoot,
    runtimeRoot,
    version,
    globalRoot = runtimeRoot,
    globalPrefix = null,
    host,
    port,
    mutationToken,
    registryRoot = process.env.PI_WEB_CODEX_REGISTRY_ROOT || null,
    instanceId = process.env.PI_WEB_CODEX_INSTANCE_ID || null,
    registry = process.env.PI_WEB_CODEX_UPDATE_REGISTRY || OFFICIAL_REGISTRY,
    fetchImpl = globalThis.fetch,
    spawnImpl = spawn,
    now = () => Date.now(),
    npmInstall = runNpmInstall,
    npmPack = runNpmPack,
    npmInstallGlobal = runNpmInstallGlobal,
    npmUninstallGlobal = runNpmUninstallGlobal,
    cliVersion = runCliVersion,
    canonicalResolver = resolveCanonicalGlobal,
    removeBackup = (backupRoot) =>
      rm(backupRoot, { recursive: true, force: true }),
    runtimeSpawner,
    waitHealthy = waitForHealth,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }) {
    this.configRoot = path.resolve(configRoot)
    this.runtimeRoot = path.resolve(runtimeRoot)
    this.globalRoot = path.resolve(globalRoot)
    this.globalPrefix = globalPrefix ? path.resolve(globalPrefix) : null
    this.currentVersion = assertStable(version, "Current version")
    this.host = host
    this.port = port
    this.mutationToken = mutationToken
    this.registryRoot = registryRoot ? path.resolve(registryRoot) : null
    this.instanceId = instanceId
    this.registry = registry
    this.fetchImpl = fetchImpl
    this.spawnImpl = spawnImpl
    this.now = now
    this.npmInstall = npmInstall
    this.npmPack = npmPack
    this.npmInstallGlobal = npmInstallGlobal
    this.npmUninstallGlobal = npmUninstallGlobal
    this.cliVersion = cliVersion
    this.runtimeSpawner = runtimeSpawner
    this.waitHealthy = waitHealthy
    this.sleep = sleep
    this.canonicalResolver = canonicalResolver
    this.removeBackup = removeBackup
    this.supported = true
    this.canonicalGlobalResolved = Boolean(globalPrefix)
    this.controlToken = randomBytes(32).toString("base64url")
    this.updateAbort = new AbortController()
    this.controlServer = null
    this.controlUrl = null
    this.controlClosePromise = null
    this.child = null
    this.phase = "idle"
    this.error = null
    this.operationId = null
    this.prepareOperationId = null
    this.latestVersion = null
    this.metadataFetchedAt = 0
    this.metadataPromise = null
    this.shuttingDown = false
    this.restarting = false
    this.runtimeStarting = false
    this.updateAdmission = false
    this.updateTask = null
    this.updateLease = null
    this.retainUpdateLease = false
    this.termination = new Promise((resolve) => {
      this.resolveTermination = resolve
    })
    this.terminationResult = null
  }

  status() {
    return snapshotFrom(this)
  }

  async loadCachedMetadata() {
    try {
      const parsed = JSON.parse(
        await readFile(metadataPath(this.configRoot), "utf8")
      )
      if (
        isStableVersion(parsed?.version) &&
        Number.isFinite(parsed?.fetchedAt) &&
        parsed.fetchedAt > 0
      ) {
        this.latestVersion = parsed.version
        this.metadataFetchedAt = parsed.fetchedAt
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError))
        throw error
    }
  }

  metadataIsFresh() {
    return (
      this.metadataFetchedAt > 0 &&
      this.now() - this.metadataFetchedAt < METADATA_TTL_MS
    )
  }

  async refreshMetadata(force = false) {
    if (!force && this.metadataIsFresh()) return this.latestVersion
    if (this.metadataPromise) return this.metadataPromise
    const previousPhase = this.phase
    if (
      !this.restarting &&
      (previousPhase === "idle" || previousPhase === "succeeded")
    ) {
      this.phase = "checking"
    }
    this.metadataPromise = (async () => {
      const { response, body: metadata } = await fetchJsonWithTimeout(
        this.fetchImpl,
        `${this.registry.replace(/\/$/, "")}/${APP_NAME}`,
        { headers: { accept: "application/json" }, redirect: "error" },
        UPDATE_TIMEOUT_MS
      )
      if (!response.ok) {
        throw new Error(
          `npm registry returned HTTP ${response.status} while checking updates.`
        )
      }
      const latest = metadata?.["dist-tags"]?.latest
      assertStable(latest, "npm latest dist-tag")
      this.latestVersion = latest
      this.metadataFetchedAt = this.now()
      await atomicWriteJson(metadataPath(this.configRoot), {
        version: latest,
        fetchedAt: this.metadataFetchedAt,
      })
      this.error = null
      if (
        !this.restarting &&
        (this.phase === "checking" || this.phase === "failed")
      ) {
        this.phase = "idle"
      }
      return latest
    })()
    try {
      return await this.metadataPromise
    } catch (error) {
      const detail = sanitizeDiagnostic(toError(error).message)
      this.error = `Update metadata check failed: ${detail}`
      if (!this.restarting) this.phase = "failed"
      throw new Error(detail)
    } finally {
      this.metadataPromise = null
    }
  }

  async ensureCanonicalGlobal() {
    if (this.canonicalGlobalResolved) return true
    try {
      const canonical = await this.canonicalResolver({
        spawnImpl: this.spawnImpl,
      })
      if (!samePath(canonical.packageRoot, this.runtimeRoot)) {
        throw new Error(
          `This CLI is running from ${this.runtimeRoot}, but npm's canonical global package is ${canonical.packageRoot}. Launch the canonical global pi-web-codex CLI before updating.`
        )
      }
      this.globalRoot = canonical.packageRoot
      this.globalPrefix = canonical.prefix
      if (!this.globalPrefix)
        throw new Error("npm did not return a canonical global prefix.")
      this.canonicalGlobalResolved = true
      return true
    } catch (error) {
      this.supported = false
      this.phase = "failed"
      this.error = `Self-update is unavailable: ${toError(error).message}`
      return false
    }
  }

  async startControlServer() {
    await this.loadCachedMetadata()
    this.controlServer = createServer((request, response) => {
      void this.handleControlRequest(request, response)
    })
    await new Promise((resolve, reject) => {
      this.controlServer.once("error", reject)
      this.controlServer.listen(0, "127.0.0.1", () => {
        const address = this.controlServer.address()
        if (!address || typeof address !== "object") {
          reject(
            new Error(
              "Update control server did not expose a loopback address."
            )
          )
          return
        }
        this.controlUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
    return this.controlUrl
  }

  async handleControlRequest(request, response) {
    if (!hasBearer(request, this.controlToken)) {
      jsonResponse(response, 401, { error: "Unauthorized." })
      return
    }
    if (request.url === "/status" && request.method === "GET") {
      if (!(await this.ensureCanonicalGlobal())) {
        jsonResponse(response, 200, this.status())
        return
      }
      try {
        await this.refreshMetadata()
      } catch {
        // The explicit failure is included in the status snapshot.
      }
      jsonResponse(response, 200, this.status())
      return
    }
    if (request.url === "/identity" && request.method === "GET") {
      jsonResponse(response, 200, {
        name: APP_NAME,
        instanceId: this.instanceId,
        pid: process.pid,
        port: this.port,
        configRoot: this.configRoot,
        controlUrl: this.controlUrl,
        status: this.shuttingDown ? "stopping" : "running",
      })
      return
    }
    if (request.url === "/update" && request.method === "POST") {
      let result
      try {
        result = await this.requestUpdate(await readRequestBody(request))
      } catch (error) {
        jsonResponse(response, 400, {
          ...this.status(),
          error: toError(error).message,
        })
        return
      }
      jsonResponse(response, result.status, result.body)
      return
    }
    if (request.url === "/shutdown" && request.method === "POST") {
      const result = await this.requestShutdown()
      jsonResponse(response, result.status, result.body)
      return
    }
    jsonResponse(response, 404, { error: "Not found." })
  }

  updateMutationActive() {
    return Boolean(
      this.updateAdmission ||
      this.restarting ||
      this.phase === "installing" ||
      this.phase === "restarting"
    )
  }

  async acquireUpdateLease() {
    if (!this.registryRoot || !this.instanceId) return
    const { globalUpdateLockFile, readRegistry, withRegistryLock } =
      await import("./instance-registry.mjs")
    const lockPath = globalUpdateLockFile(this.registryRoot)
    const token = randomBytes(24).toString("base64url")
    await withRegistryLock(this.registryRoot, async () => {
      const registry = await readRegistry(this.registryRoot)
      const others = registry.instances.filter(
        (instance) =>
          instance.status === "running" && instance.id !== this.instanceId
      )
      if (others.length > 0) {
        throw new Error(
          `Shared global update is refused while other managed instances are running: ${others
            .map((instance) => String(instance.id))
            .join(
              ", "
            )}. Stop them first so package mutation remains coordinated.`
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
              "Another managed update changed state while its lease was being acquired; retry."
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
          `${JSON.stringify({ pid: process.pid, instanceId: this.instanceId, token })}\n`
        )
        await handle.sync()
      } finally {
        await handle.close()
      }
      this.updateLease = { lockPath, token }
    })
  }

  async releaseUpdateLease() {
    const lease = this.updateLease
    if (!lease) return
    this.updateLease = null
    let owner
    try {
      owner = JSON.parse(await readFile(lease.lockPath, "utf8"))
    } catch (error) {
      if (error?.code === "ENOENT") return
      throw error
    }
    if (owner?.token === lease.token) await rm(lease.lockPath, { force: true })
  }

  async requestShutdown() {
    if (this.updateMutationActive()) {
      return {
        status: 409,
        body: {
          ...this.status(),
          error:
            "Shutdown is refused while a package update is mutating the shared global installation; wait for it to finish and retry.",
        },
      }
    }
    void this.shutdown("SIGTERM").catch((error) => {
      this.error = `Shutdown failed: ${toError(error).message}`
    })
    return {
      status: 202,
      body: { ...this.status(), shuttingDown: true },
    }
  }

  async assertUpdateCoordination() {
    if (!this.registryRoot || !this.instanceId) return
    let parsed
    try {
      parsed = JSON.parse(
        await readFile(path.join(this.registryRoot, "instances.json"), "utf8")
      )
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(
          "Shared global update is unavailable because the managed instance registry is missing."
        )
      }
      throw error
    }
    if (
      !parsed ||
      parsed.version !== 1 ||
      parsed.defaultId !== "default" ||
      !Array.isArray(parsed.instances)
    ) {
      throw new Error(
        "Shared global update is unavailable because the managed instance registry is invalid."
      )
    }
    const others = parsed.instances.filter(
      (instance) =>
        instance?.status === "running" && instance.id !== this.instanceId
    )
    if (others.length > 0) {
      throw new Error(
        `Shared global update is refused while other managed instances are running: ${others
          .map((instance) => String(instance.id))
          .join(
            ", "
          )}. Stop them first so package mutation remains coordinated.`
      )
    }
  }

  async requestUpdate(body) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof body.version !== "string" ||
      Object.keys(body).length !== 1
    ) {
      return {
        status: 400,
        body: {
          ...this.status(),
          error: "Update body must be {version:string}.",
        },
      }
    }
    if (!isStableVersion(body.version)) {
      return {
        status: 400,
        body: {
          ...this.status(),
          error: "version must be a stable full semantic version.",
        },
      }
    }

    if (
      this.updateAdmission ||
      this.restarting ||
      this.runtimeStarting ||
      this.phase === "checking" ||
      this.phase === "installing"
    ) {
      return {
        status: 409,
        body: {
          ...this.status(),
          error: "An update is already in progress.",
        },
      }
    }

    this.updateAdmission = true
    try {
      await this.acquireUpdateLease()
    } catch (error) {
      this.updateAdmission = false
      return {
        status: 409,
        body: {
          ...this.status(),
          error: toError(error).message,
        },
      }
    }
    this.retainUpdateLease = false
    const operationId = randomUUID()
    this.operationId = operationId
    this.phase = "checking"
    this.error = null

    if (!(await this.ensureCanonicalGlobal())) {
      this.updateAdmission = false
      await this.releaseUpdateLease().catch(() => {})
      return { status: 503, body: this.status() }
    }

    try {
      await this.refreshMetadata()
    } catch (error) {
      this.phase = "failed"
      this.error = `Update metadata check failed: ${toError(error).message}`
      this.updateAdmission = false
      await this.releaseUpdateLease().catch(() => {})
      return { status: 503, body: this.status() }
    }
    if (
      this.latestVersion !== body.version ||
      compareSemver(this.latestVersion, this.currentVersion) <= 0
    ) {
      this.phase = "failed"
      this.error = `Requested version ${body.version} is not the current latest stable update.`
      this.operationId = null
      this.updateAdmission = false
      await this.releaseUpdateLease().catch(() => {})
      return { status: 409, body: this.status() }
    }
    this.phase = "installing"
    this.updateTask = this.performUpdate(operationId, body.version).finally(
      () => {
        this.updateTask = null
      }
    )
    return { status: 202, body: this.status() }
  }

  runtimeEnvironment(runtimeRoot, verifying = false) {
    return {
      ...process.env,
      HOSTNAME: this.host,
      PORT: String(this.port),
      PI_WEB_CODEX_CONFIG_DIR: this.configRoot,
      PI_WEB_CODEX_INSTANCE_PORT: String(this.port),
      ...(this.instanceId ? { PI_WEB_CODEX_INSTANCE_ID: this.instanceId } : {}),
      ...(this.registryRoot
        ? { PI_WEB_CODEX_REGISTRY_ROOT: this.registryRoot }
        : {}),
      PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT: path.join(
        runtimeRoot,
        "dist",
        "webui-extensions"
      ),
      PI_WEB_CODEX_PI_WORKER_PATH: path.join(
        runtimeRoot,
        "dist",
        "workers",
        "pi",
        "dist",
        "worker.mjs"
      ),
      PI_WEB_CODEX_PI_CLIENT_WORKER_PATH: path.join(
        runtimeRoot,
        "dist",
        "workers",
        "pi-client",
        "dist",
        "worker.mjs"
      ),
      PI_WEB_CODEX_UPDATE_CONTROL_URL: this.controlUrl,
      PI_WEB_CODEX_UPDATE_CONTROL_TOKEN: this.controlToken,
      PI_WEB_CODEX_UPDATE_OPERATION_ID: this.prepareOperationId ?? "",
      PI_WEB_CODEX_MUTATION_TOKEN: this.mutationToken,
      PI_WEB_CODEX_UPDATE_VERIFYING: verifying ? "1" : "",
    }
  }

  spawnRuntime(runtimeRoot, verifying = false) {
    const serverPath = getRuntimeServerPath(runtimeRoot)
    if (this.runtimeSpawner) {
      return this.runtimeSpawner({
        runtimeRoot,
        serverPath,
        env: this.runtimeEnvironment(runtimeRoot, verifying),
        host: this.host,
        port: this.port,
      })
    }
    return this.spawnImpl(process.execPath, [serverPath], {
      cwd: path.dirname(serverPath),
      env: this.runtimeEnvironment(runtimeRoot, verifying),
      detached: process.platform !== "win32",
      stdio: "inherit",
      windowsHide: true,
      shell: false,
    })
  }

  attachChild(child, runtimeRoot, expectedVersion) {
    const record = { child, runtimeRoot, expectedVersion }
    child.once("exit", (code, signal) => {
      if (this.child === child) {
        this.child = null
        if (!this.restarting && !this.shuttingDown) {
          this.terminationResult = { code: code ?? 1, signal, runtimeRoot }
          this.resolveTermination(this.terminationResult)
        }
      }
    })
    child.once("error", (error) => {
      if (this.child === child && !this.restarting && !this.shuttingDown) {
        this.child = null
        this.terminationResult = { error, code: 1, runtimeRoot }
        this.resolveTermination(this.terminationResult)
      }
    })
    return record
  }

  async startRuntime(runtimeRoot, expectedVersion, verifying = false) {
    if (this.shuttingDown) {
      throw new Error(
        "Supervisor is shutting down; runtime startup was cancelled."
      )
    }
    const child = this.spawnRuntime(runtimeRoot, verifying)
    this.child = child
    this.attachChild(child, runtimeRoot, expectedVersion)
    const spawnError = new Promise((_, reject) => child.once("error", reject))
    try {
      await Promise.race([
        this.waitHealthy(
          this.fetchImpl,
          `http://${this.host}:${this.port}`,
          child,
          expectedVersion,
          { sleep: this.sleep }
        ),
        spawnError,
      ])
      return child
    } catch (error) {
      await stopChild(child)
      if (this.child === child) this.child = null
      throw toError(error)
    }
  }

  async prepareCurrentRuntime() {
    const response = await fetchWithTimeout(
      this.fetchImpl,
      `http://${this.host}:${this.port}/api/v1/update/prepare`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.controlToken}` },
        redirect: "error",
      },
      UPDATE_TIMEOUT_MS
    )
    if (response.status === 409) {
      throw new Error("Update refused because active work is still running.")
    }
    if (!response.ok) {
      throw new Error(`Update prepare failed with HTTP ${response.status}.`)
    }
    this.prepareOperationId = null
    try {
      const body = await response.json()
      if (typeof body?.operationId === "string" && body.operationId) {
        this.prepareOperationId = body.operationId
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
    }
    return response
  }

  async releasePrepare() {
    try {
      const response = await fetchWithTimeout(
        this.fetchImpl,
        `http://${this.host}:${this.port}/api/v1/update/prepare`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.controlToken}`,
            ...(this.prepareOperationId
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(this.prepareOperationId
            ? { body: JSON.stringify({ operationId: this.prepareOperationId }) }
            : {}),
          redirect: "error",
        },
        UPDATE_TIMEOUT_MS
      )
      if (!response.ok)
        throw new Error(
          `Update prepare release failed with HTTP ${response.status}.`
        )
      this.prepareOperationId = null
      return true
    } catch (error) {
      this.error = `${this.error ? `${this.error} ` : ""}Could not release update prepare gate: ${toError(error).message}`
      return false
    }
  }

  async stage(version, operationId) {
    const stageRoot = path.join(
      updatesRoot(this.configRoot),
      `${version}-${operationId}`
    )
    await mkdir(stageRoot, { recursive: true, mode: 0o700 })
    try {
      await this.npmInstall(
        stageRoot,
        version,
        this.registry,
        this.spawnImpl,
        this.updateAbort.signal
      )
      const installedRoot = await packageInstallRoot(stageRoot)
      const verified = await verifyInstalledRuntime(installedRoot, version)
      const checkConfig = path.join(stageRoot, "version-check")
      await this.cliVersion(
        verified.cliPath,
        checkConfig,
        version,
        this.spawnImpl,
        this.updateAbort.signal
      )
      const tarball = await this.npmPack(
        verified.root,
        path.join(stageRoot, "global-tarball"),
        this.spawnImpl,
        this.updateAbort.signal
      )
      return { stageRoot, runtimeRoot: verified.root, version, tarball }
    } catch (error) {
      const stageError = toError(error)
      if (!stageError.npmProcessStillRunning) {
        await rm(stageRoot, { recursive: true, force: true })
      }
      throw stageError
    }
  }

  async writeJournal(stageRoot, journal) {
    await atomicWriteJson(path.join(stageRoot, "operation.json"), journal)
  }

  async verifyGlobal(version) {
    const verified = await verifyInstalledRuntime(this.globalRoot, version)
    await this.cliVersion(
      verified.cliPath,
      path.join(this.configRoot, "updates", "version-check"),
      version,
      this.spawnImpl,
      this.updateAbort.signal
    )
    return verified
  }

  async installStagedGlobally(stageInfo) {
    await this.npmInstallGlobal(
      stageInfo.tarball,
      this.globalPrefix,
      this.spawnImpl,
      this.updateAbort.signal
    )
    return this.verifyGlobal(stageInfo.version)
  }

  async performUpdate(operationId, version) {
    const oldRuntime = { root: this.runtimeRoot, version: this.currentVersion }
    const oldChild = this.child
    let prepared = false
    let oldStopped = false
    let candidate = null
    let stageInfo = null
    let backup = null
    let backupRoot = null
    let previousTarball = null
    let globalInstallAttempted = false
    let globalInstalled = false
    this.restarting = true
    try {
      if (this.shuttingDown)
        throw new Error(
          "Update cancelled because the supervisor is shutting down."
        )
      stageInfo = await this.stage(version, operationId)
      await this.writeJournal(stageInfo.stageRoot, {
        operationId,
        phase: "staged",
        targetVersion: version,
        previousVersion: oldRuntime.version,
        previousRuntimeRoot: oldRuntime.root,
        globalRoot: this.globalRoot,
        startedAt: new Date(this.now()).toISOString(),
      })
      if (this.operationId !== operationId)
        throw new Error("Update operation was superseded.")
      if (this.shuttingDown)
        throw new Error(
          "Update cancelled because the supervisor is shutting down."
        )

      try {
        await access(path.join(this.globalRoot, "package.json"), constants.R_OK)
        previousTarball = await this.npmPack(
          this.globalRoot,
          path.join(stageInfo.stageRoot, "previous-global"),
          this.spawnImpl,
          this.updateAbort.signal
        )
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
      await this.prepareCurrentRuntime()
      prepared = true
      this.phase = "restarting"
      await stopChild(oldChild)
      oldStopped = true
      if (this.child === oldChild) this.child = null
      backupRoot = path.join(stageInfo.stageRoot, "rollback-backup")
      backup = await backupConfig(this.configRoot, backupRoot)
      if (this.shuttingDown)
        throw new Error(
          "Update cancelled because the supervisor is shutting down."
        )
      await this.writeJournal(stageInfo.stageRoot, {
        operationId,
        phase: "prepared",
        targetVersion: version,
        previousVersion: oldRuntime.version,
        previousRuntimeRoot: oldRuntime.root,
        previousTarball,
        globalRoot: this.globalRoot,
        startedAt: new Date(this.now()).toISOString(),
      })

      globalInstallAttempted = true
      await this.installStagedGlobally(stageInfo)
      globalInstalled = true
      await this.writeJournal(stageInfo.stageRoot, {
        operationId,
        phase: "global-installed",
        targetVersion: version,
        previousVersion: oldRuntime.version,
        previousRuntimeRoot: oldRuntime.root,
        previousTarball,
        globalRoot: this.globalRoot,
        startedAt: new Date(this.now()).toISOString(),
      })

      if (this.shuttingDown)
        throw new Error(
          "Update cancelled because the supervisor is shutting down."
        )
      candidate = await this.startRuntime(this.globalRoot, version, true)
      // The candidate is intentionally verification-gated. Releasing this
      // gate only after the exact health version has passed is what keeps a
      // failed candidate from writing user state during migration.
      await this.writeJournal(stageInfo.stageRoot, {
        operationId,
        phase: "candidate-healthy",
        targetVersion: version,
        previousVersion: oldRuntime.version,
        previousRuntimeRoot: oldRuntime.root,
        previousTarball,
        globalRoot: this.globalRoot,
        startedAt: new Date(this.now()).toISOString(),
      })
      if (!(await this.releasePrepare())) {
        throw new Error(
          this.error ??
            "Candidate passed health but update prepare gate could not be released."
        )
      }
      prepared = false
      this.runtimeRoot = this.globalRoot
      this.currentVersion = version
      this.updateAbort = new AbortController()
      let cleanupError = null
      try {
        await this.writeJournal(stageInfo.stageRoot, {
          operationId,
          phase: "succeeded",
          targetVersion: version,
          previousVersion: oldRuntime.version,
          previousRuntimeRoot: oldRuntime.root,
          previousTarball,
          globalRoot: this.globalRoot,
          startedAt: new Date(this.now()).toISOString(),
        })
        await this.removeBackup(backupRoot)
      } catch (cleanupFailure) {
        cleanupError = toError(cleanupFailure)
      }
      this.phase = "succeeded"
      this.error = cleanupError
        ? `Update succeeded but cleanup did not complete: ${cleanupError.message}`
        : null
      this.operationId = operationId
      this.restarting = false
      this.updateAdmission = false
      return
    } catch (error) {
      const updateError = toError(error)
      this.retainUpdateLease = Boolean(updateError.npmProcessStillRunning)
      if (prepared && !oldStopped) await this.releasePrepare()
      let candidateStopError = null
      if (candidate) {
        try {
          await stopChild(candidate)
        } catch (candidateError) {
          candidateStopError = toError(candidateError)
          updateError.message += ` Candidate shutdown failed: ${candidateStopError.message}`
        }
        if (!candidateStopError && this.child === candidate) this.child = null
      }
      this.prepareOperationId = null
      let rollbackStateError = null
      let rollbackGlobalError = null
      const rollbackBlocked = Boolean(updateError.npmProcessStillRunning)
      if (rollbackBlocked) {
        updateError.message +=
          " Previous runtime restart is blocked until the npm child is confirmed stopped."
      }
      if (
        oldStopped &&
        !this.shuttingDown &&
        !candidateStopError &&
        !rollbackBlocked
      ) {
        if (backup && backupRoot) {
          try {
            await restoreConfig(this.configRoot, backupRoot, backup)
          } catch (restoreError) {
            rollbackStateError = toError(restoreError)
            updateError.message += ` Rollback state restore failed: ${rollbackStateError.message}`
          }
        }
        if (globalInstallAttempted && !rollbackStateError) {
          try {
            if (previousTarball) {
              await this.npmInstallGlobal(
                previousTarball,
                this.globalPrefix,
                this.spawnImpl,
                this.updateAbort.signal
              )
              await this.verifyGlobal(oldRuntime.version)
            } else if (globalInstalled) {
              await this.npmUninstallGlobal(
                this.globalPrefix,
                this.spawnImpl,
                this.updateAbort.signal
              )
            }
          } catch (restoreGlobalError) {
            rollbackGlobalError = toError(restoreGlobalError)
            updateError.message += ` Previous global package restore failed: ${rollbackGlobalError.message}`
          }
        }
        if (!rollbackStateError && !rollbackGlobalError) {
          try {
            const rollbackChild = await this.startRuntime(
              oldRuntime.root,
              oldRuntime.version,
              false
            )
            this.child = rollbackChild
            this.runtimeRoot = oldRuntime.root
            this.currentVersion = oldRuntime.version
          } catch (rollbackError) {
            updateError.message += ` Previous runtime restart failed: ${toError(rollbackError).message}`
          }
        }
      }
      this.phase = "failed"
      this.error = `Update ${version} failed: ${updateError.message}`
      this.operationId = operationId
      this.restarting = false
      this.updateAdmission = false
      if (stageInfo?.stageRoot) {
        // Keep the failed staged package and its diagnostic files. It is
        // scoped to updates/<version-operationId> and never becomes active.
      }
    } finally {
      if (!this.retainUpdateLease) {
        try {
          await this.releaseUpdateLease()
        } catch (leaseError) {
          this.error = `${this.error ? `${this.error} ` : ""}Could not release shared update lease: ${toError(leaseError).message}`
        }
      }
    }
  }

  async start() {
    await this.startControlServer()
    try {
      await this.startRuntime(this.runtimeRoot, this.currentVersion, false)
    } catch (error) {
      await this.closeControlServer()
      throw error
    }
    return this
  }

  async waitForTermination() {
    return this.termination
  }

  async shutdown(signal = "SIGTERM") {
    if (this.shuttingDown) return
    this.shuttingDown = true
    this.restarting = true
    this.updateAbort.abort()
    if (this.updateTask) {
      await this.updateTask.catch(() => {})
    }
    let stopError = null
    try {
      await stopChild(this.child)
    } catch (error) {
      stopError = toError(error)
    }
    this.child = null
    this.restarting = false
    this.terminationResult = stopError
      ? { error: stopError, code: 1, signal }
      : { code: signal === "SIGINT" ? 130 : 143, signal }
    this.resolveTermination(this.terminationResult)
    await this.closeControlServer()
    if (stopError) throw stopError
  }

  async closeControlServer() {
    if (this.controlClosePromise) return this.controlClosePromise
    const server = this.controlServer
    if (!server) return
    this.controlServer = null
    this.controlClosePromise = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    }).finally(() => {
      this.controlClosePromise = null
    })
    return this.controlClosePromise
  }
}

export async function createMutationToken(configRoot) {
  return getMutationToken(configRoot)
}

export { backupConfig, restoreConfig, stopChild, waitForHealth }
