import { access, cp, mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const nextRoot = path.join(root, "apps", "web", ".next")
const outputRoot = path.join(root, "dist", "app")

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

const leakedSource = (await sourceFiles(outputRoot)).find((file) =>
  /\.tsx?$/.test(file)
)
if (leakedSource) {
  throw new Error(`Production package contains source: ${leakedSource}`)
}
