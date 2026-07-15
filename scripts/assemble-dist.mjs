import { execFile } from "node:child_process"
import {
  access,
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const root = process.cwd()
const nextRoot = path.join(root, "apps", "web", ".next")
const outputRoot = path.join(root, "dist", "app")
const run = promisify(execFile)

async function exists(target) {
  try {
    await access(target)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name)
      return entry.isDirectory() ? sourceFiles(target) : [target]
    })
  )
  return nested.flat()
}

async function copyPortable(source, destination, ancestors = new Set()) {
  const sourceStats = await lstat(source)
  if (sourceStats.isSymbolicLink()) {
    let resolved
    try {
      resolved = await realpath(source)
    } catch (error) {
      if (error.code === "ENOENT") return
      throw error
    }
    return copyPortable(resolved, destination, ancestors)
  }
  if (!sourceStats.isDirectory()) {
    await cp(source, destination)
    return
  }

  const canonical = await realpath(source)
  if (ancestors.has(canonical)) {
    throw new Error(`Standalone dependency contains a cyclic link: ${source}`)
  }
  const descendants = new Set(ancestors).add(canonical)
  await mkdir(destination, { recursive: true })
  const entries = await readdir(source)
  await Promise.all(
    entries.map((entry) =>
      copyPortable(
        path.join(source, entry),
        path.join(destination, entry),
        descendants
      )
    )
  )
}

async function removeTypeScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) return removeTypeScript(target)
      if (/\.tsx?$/.test(entry.name) || /\.ts\.map$/.test(entry.name)) {
        await rm(target)
      }
    })
  )
}

await rm(path.join(root, "dist"), { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
const standaloneRoot = path.join(nextRoot, "standalone")
await copyPortable(standaloneRoot, outputRoot)
await copyPortable(
  path.join(standaloneRoot, "node_modules", ".pnpm", "node_modules"),
  path.join(outputRoot, "node_modules")
)

const appRoot = path.join(outputRoot, "apps", "web")
await mkdir(path.join(appRoot, ".next"), { recursive: true })
await cp(path.join(nextRoot, "static"), path.join(appRoot, ".next", "static"), {
  recursive: true,
})

const publicRoot = path.join(root, "apps", "web", "public")
if (await exists(publicRoot)) {
  await cp(publicRoot, path.join(appRoot, "public"), { recursive: true })
}

const pnpmEntrypoint = process.env.npm_execpath
if (!pnpmEntrypoint)
  throw new Error("npm_execpath is required to deploy workers.")
async function deployWorker(packageName, directory) {
  const workerRoot = path.join(root, "dist", "workers", directory)
  await run(
    process.execPath,
    [pnpmEntrypoint, "--filter", packageName, "deploy", "--prod", workerRoot],
    { cwd: root }
  )
  await removeTypeScript(workerRoot)
}

await Promise.all([
  deployWorker("@workspace/worker-pi", "pi"),
  deployWorker("@workspace/worker-pi-client", "pi-client"),
])

const builtinSourceRoot = path.join(root, "webui-extensions", "builtin")
const builtinOutputRoot = path.join(root, "dist", "webui-extensions")
const builtinPackages = await readdir(builtinSourceRoot, {
  withFileTypes: true,
})
await Promise.all(
  builtinPackages
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const source = path.join(builtinSourceRoot, entry.name)
      const packageJson = JSON.parse(
        await readFile(path.join(source, "package.json"), "utf8")
      )
      if (!packageJson.piWebCodex) return
      const destination = path.join(builtinOutputRoot, entry.name)
      await mkdir(destination, { recursive: true })
      await cp(
        path.join(source, "package.json"),
        path.join(destination, "package.json")
      )
      await copyPortable(
        path.join(source, "dist"),
        path.join(destination, "dist")
      )
    })
)

const productionFiles = await sourceFiles(path.join(root, "dist"))
await Promise.all(
  productionFiles
    .filter((file) =>
      /\/node-pty\/prebuilds\/darwin-[^/]+\/spawn-helper$/.test(
        file.split(path.sep).join("/")
      )
    )
    .map((file) => chmod(file, 0o755))
)

const leakedSource = productionFiles.find((file) => /\.tsx?$/.test(file))
if (leakedSource) {
  throw new Error(`Production package contains source: ${leakedSource}`)
}
