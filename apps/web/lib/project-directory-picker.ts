import "server-only"
import { readdir, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

// Only list the selected directory; never crawl files or session contents.
export async function listProjectDirectories(inputPath = homedir()) {
  if (!path.isAbsolute(inputPath) || inputPath.includes("\0")) {
    throw new Error("Enter an absolute directory path.")
  }
  const currentPath = await realpath(inputPath)
  const entries = await readdir(currentPath, { withFileTypes: true })
  const parent = path.dirname(currentPath)
  return {
    path: currentPath,
    parent: parent === currentPath ? null : parent,
    directories: entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(currentPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}
