import { execFile } from "node:child_process"
import { access, cp, mkdir, readdir, rm } from "node:fs/promises"
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
await cp(path.join(nextRoot, "standalone"), outputRoot, { recursive: true })

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
const workerRoot = path.join(root, "dist", "workers", "pi")
await run(
  process.execPath,
  [
    pnpmEntrypoint,
    "--filter",
    "@workspace/worker-pi",
    "deploy",
    "--prod",
    workerRoot,
  ],
  { cwd: root }
)
await removeTypeScript(workerRoot)

const leakedSource = (await sourceFiles(path.join(root, "dist"))).find((file) =>
  /\.tsx?$/.test(file)
)
if (leakedSource) {
  throw new Error(`Production package contains source: ${leakedSource}`)
}
