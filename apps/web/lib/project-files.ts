import "server-only"

import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"

const MAX_PREVIEW_BYTES = 1024 * 1024

export type ProjectFileEntry = {
  name: string
  path: string
  type: "directory" | "file" | "symbolic-link" | "other"
  size: number
  modifiedAt: string
}

export type ProjectDirectory = {
  kind: "directory"
  path: string
  entries: ProjectFileEntry[]
}

export type ProjectFile = {
  kind: "file"
  path: string
  name: string
  size: number
  modifiedAt: string
  preview: string | null
  previewUnavailable: "binary" | "too-large" | null
}

export class ProjectFileError extends Error {
  constructor(
    message: string,
    readonly code:
      "InvalidPath" | "OutsideProject" | "Unavailable" | "UnsupportedEntry"
  ) {
    super(message)
    this.name = "ProjectFileError"
  }
}

async function existingPath(
  target: string,
  unavailableMessage: string,
  code: "InvalidPath" | "Unavailable"
) {
  try {
    return await realpath(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ProjectFileError(unavailableMessage, code)
    }
    throw error
  }
}

function isInside(root: string, target: string) {
  const relative = path.relative(root, target)
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
}

function webPath(root: string, target: string) {
  return path.relative(root, target).split(path.sep).join("/")
}

async function resolveEntry(projectPath: string, requestedPath: string) {
  if (path.isAbsolute(requestedPath) || requestedPath.includes("\0")) {
    throw new ProjectFileError(
      "Project file paths must be relative.",
      "InvalidPath"
    )
  }

  const root = await existingPath(
    projectPath,
    "The project directory no longer exists.",
    "Unavailable"
  )
  const candidate = path.resolve(root, requestedPath || ".")
  if (!isInside(root, candidate)) {
    throw new ProjectFileError(
      "The requested path is outside the project.",
      "OutsideProject"
    )
  }
  const target = await existingPath(
    candidate,
    "The requested project path does not exist.",
    "InvalidPath"
  )
  if (!isInside(root, target)) {
    throw new ProjectFileError(
      "The requested symbolic link resolves outside the project.",
      "OutsideProject"
    )
  }
  return { root, target }
}

function entryType(value: Awaited<ReturnType<typeof lstat>>) {
  if (value.isSymbolicLink()) return "symbolic-link" as const
  if (value.isDirectory()) return "directory" as const
  if (value.isFile()) return "file" as const
  return "other" as const
}

export async function readProjectEntry(
  projectPath: string,
  requestedPath = ""
): Promise<ProjectDirectory | ProjectFile> {
  const { root, target } = await resolveEntry(projectPath, requestedPath)
  const targetStats = await stat(target)
  const relativePath = webPath(root, target)

  if (targetStats.isDirectory()) {
    const names = await readdir(target)
    const entries = await Promise.all(
      names.map(async (name): Promise<ProjectFileEntry> => {
        const entryPath = path.join(target, name)
        const entryStats = await lstat(entryPath)
        return {
          name,
          path: webPath(root, entryPath),
          type: entryType(entryStats),
          size: entryStats.size,
          modifiedAt: entryStats.mtime.toISOString(),
        }
      })
    )
    entries.sort(
      (left, right) =>
        Number(right.type === "directory") -
          Number(left.type === "directory") ||
        left.name.localeCompare(right.name)
    )
    return { kind: "directory", path: relativePath, entries }
  }

  if (!targetStats.isFile()) {
    throw new ProjectFileError(
      "Only regular files and directories can be opened.",
      "UnsupportedEntry"
    )
  }

  let preview: string | null = null
  let previewUnavailable: ProjectFile["previewUnavailable"] = null
  if (targetStats.size > MAX_PREVIEW_BYTES) {
    previewUnavailable = "too-large"
  } else {
    const contents = await readFile(target)
    try {
      preview = new TextDecoder("utf-8", { fatal: true }).decode(contents)
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      previewUnavailable = "binary"
    }
  }

  return {
    kind: "file",
    path: relativePath,
    name: path.basename(target),
    size: targetStats.size,
    modifiedAt: targetStats.mtime.toISOString(),
    preview,
    previewUnavailable,
  }
}

export async function readProjectFile(
  projectPath: string,
  requestedPath: string
) {
  const { target } = await resolveEntry(projectPath, requestedPath)
  const targetStats = await stat(target)
  if (!targetStats.isFile()) {
    throw new ProjectFileError(
      "Only regular files can be downloaded.",
      "UnsupportedEntry"
    )
  }
  return {
    name: path.basename(target),
    contents: await readFile(target),
  }
}
