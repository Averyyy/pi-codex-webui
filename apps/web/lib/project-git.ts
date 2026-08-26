import "server-only"

import { spawn } from "node:child_process"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

export type GitFileStatus = {
  index: string
  workingTree: string
  path: string
  originalPath: string | null
}

export type ProjectGitStatus =
  | {
      available: false
      error: string
    }
  | {
      available: true
      root: string
      branch: string | null
      commit: string | null
      upstream: string | null
      ahead: number
      behind: number
      additions: number
      deletions: number
      files: GitFileStatus[]
    }

export type ProjectGitDiff = {
  path: string
  originalPath: string | null
  hunks: string[]
}

type GitResult = { code: number; stdout: string; stderr: string }

export class ProjectGitError extends Error {}

function runGit(
  cwd: string,
  args: string[],
  environment?: Record<string, string>
) {
  return new Promise<GitResult>((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], {
      env: environment ? { ...process.env, ...environment } : undefined,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.once("error", reject)
    child.once("exit", (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      })
    )
  })
}

function commandValue(result: GitResult) {
  return result.code === 0 ? result.stdout.trim() || null : null
}

async function diffAgainstEmpty(
  projectPath: string,
  filePath: string,
  hasHead: boolean
) {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-web-codex-diff-"))
  const environment = { GIT_INDEX_FILE: path.join(directory, "index") }
  try {
    const initialize = await runGit(
      projectPath,
      hasHead ? ["read-tree", "HEAD"] : ["read-tree", "--empty"],
      environment
    )
    if (initialize.code !== 0) {
      throw new ProjectGitError(
        initialize.stderr.trim() || "Git diff index initialization failed."
      )
    }
    const add = await runGit(
      projectPath,
      ["add", "--intent-to-add", "--", filePath],
      environment
    )
    if (add.code !== 0) {
      throw new ProjectGitError(add.stderr.trim() || "Git diff failed.")
    }
    const result = await runGit(
      projectPath,
      ["diff", "--no-ext-diff", "--no-color", "--unified=3", "--", filePath],
      environment
    )
    if (result.code !== 0) {
      throw new ProjectGitError(result.stderr.trim() || "Git diff failed.")
    }
    return result.stdout
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function createProjectWorktree(
  projectPath: string,
  targetPath: string,
  branch: string
) {
  const result = await runGit(projectPath, [
    "worktree",
    "add",
    "-b",
    branch,
    targetPath,
  ])
  if (result.code !== 0) {
    throw new ProjectGitError(
      result.stderr.trim() || "Git worktree creation failed."
    )
  }
}

function projectRelativePath(
  repositoryRoot: string,
  projectPath: string,
  filePath: string
) {
  const prefix = path
    .relative(repositoryRoot, path.resolve(projectPath))
    .split(path.sep)
    .filter(Boolean)
    .join("/")
  if (!prefix) return filePath
  const prefixWithSeparator = `${prefix}/`
  if (!filePath.startsWith(prefixWithSeparator)) {
    throw new ProjectGitError(
      "Git returned a path outside the registered project."
    )
  }
  return filePath.slice(prefixWithSeparator.length)
}

function parseStatus(
  output: string,
  repositoryRoot: string,
  projectPath: string
) {
  const records = output.split("\0")
  const files: GitFileStatus[] = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue
    const status = record.slice(0, 2)
    const renamed = status.includes("R") || status.includes("C")
    files.push({
      index: status[0] ?? " ",
      workingTree: status[1] ?? " ",
      path: projectRelativePath(repositoryRoot, projectPath, record.slice(3)),
      originalPath: renamed
        ? projectRelativePath(
            repositoryRoot,
            projectPath,
            records[++index] ?? ""
          )
        : null,
    })
  }
  return files
}

function parseLineStats(output: string) {
  let additions = 0
  let deletions = 0
  for (const line of output.split("\n")) {
    if (!line) continue
    const [added, deleted] = line.split("\t", 2)
    if (added !== "-") additions += Number(added) || 0
    if (deleted !== "-") deletions += Number(deleted) || 0
  }
  return { additions, deletions }
}

async function readLineStats(
  projectPath: string,
  files: GitFileStatus[],
  hasHead: boolean
) {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-web-codex-stats-"))
  const environment = { GIT_INDEX_FILE: path.join(directory, "index") }
  try {
    const initialize = await runGit(
      projectPath,
      hasHead ? ["read-tree", "HEAD"] : ["read-tree", "--empty"],
      environment
    )
    if (initialize.code !== 0) {
      throw new ProjectGitError(
        initialize.stderr.trim() || "Git line statistics failed."
      )
    }

    const newPaths = files
      .filter(
        (file) =>
          file.index === "?" ||
          file.index === "A" ||
          file.index === "R" ||
          file.index === "C" ||
          file.workingTree === "A"
      )
      .map((file) => file.path)
    if (newPaths.length) {
      const add = await runGit(
        projectPath,
        ["add", "--intent-to-add", "--", ...newPaths],
        environment
      )
      if (add.code !== 0) {
        throw new ProjectGitError(
          add.stderr.trim() || "Git line statistics failed."
        )
      }
    }

    const result = await runGit(
      projectPath,
      [
        "diff",
        "--numstat",
        "--no-ext-diff",
        ...(hasHead ? ["HEAD"] : []),
        "--",
        ".",
      ],
      environment
    )
    if (result.code !== 0) {
      throw new ProjectGitError(
        result.stderr.trim() || "Git line statistics failed."
      )
    }
    return parseLineStats(result.stdout)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function readProjectGitStatus(
  projectPath: string
): Promise<ProjectGitStatus> {
  let canonicalProjectPath: string
  try {
    canonicalProjectPath = await realpath(projectPath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ENOENT" || code === "ENOTDIR") {
      return {
        available: false,
        error: "The project directory no longer exists.",
      }
    }
    throw error
  }

  let root: GitResult
  try {
    root = await runGit(projectPath, ["rev-parse", "--show-toplevel"])
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { available: false, error: "Git executable is not installed." }
    }
    throw error
  }
  if (root.code !== 0) {
    return {
      available: false,
      error: root.stderr.trim() || "The project is not inside a Git worktree.",
    }
  }

  const [branch, commit, upstream, status] = await Promise.all([
    runGit(projectPath, ["symbolic-ref", "--short", "-q", "HEAD"]),
    runGit(projectPath, ["rev-parse", "--short=12", "HEAD"]),
    runGit(projectPath, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]),
    runGit(projectPath, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ".",
    ]),
  ])
  if (status.code !== 0) {
    return {
      available: false,
      error: status.stderr.trim() || "Git status failed.",
    }
  }

  const upstreamName = commandValue(upstream)
  let ahead = 0
  let behind = 0
  if (upstreamName) {
    const divergence = await runGit(projectPath, [
      "rev-list",
      "--left-right",
      "--count",
      "HEAD...@{upstream}",
    ])
    if (divergence.code !== 0) {
      return {
        available: false,
        error: divergence.stderr.trim() || "Git divergence check failed.",
      }
    }
    const counts = divergence.stdout.trim().split(/\s+/).map(Number)
    ahead = counts[0] ?? 0
    behind = counts[1] ?? 0
  }

  const files = parseStatus(
    status.stdout,
    root.stdout.trim(),
    canonicalProjectPath
  )
  let lineStats: { additions: number; deletions: number }
  try {
    lineStats = await readLineStats(
      projectPath,
      files,
      Boolean(commandValue(commit))
    )
  } catch (error) {
    if (error instanceof ProjectGitError) {
      return { available: false, error: error.message }
    }
    throw error
  }

  return {
    available: true,
    root: root.stdout.trim(),
    branch: commandValue(branch),
    commit: commandValue(commit),
    upstream: upstreamName,
    ahead,
    behind,
    ...lineStats,
    files,
  }
}

export async function readProjectGitDiff(
  projectPath: string,
  requestedPath: string
): Promise<ProjectGitDiff> {
  const status = await readProjectGitStatus(projectPath)
  if (!status.available) throw new ProjectGitError(status.error)

  const file = status.files.find((entry) => entry.path === requestedPath)
  if (!file) {
    throw new ProjectGitError("The requested path has no working tree changes.")
  }

  const hasHead = commandValue(
    await runGit(projectPath, ["rev-parse", "--verify", "HEAD"])
  )
  let patch: string
  if (file.index === "?" || !hasHead) {
    patch = await diffAgainstEmpty(projectPath, file.path, Boolean(hasHead))
  } else {
    const result = await runGit(projectPath, [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--unified=3",
      "HEAD",
      "--",
      ...(file.originalPath ? [file.originalPath] : []),
      file.path,
    ])
    if (result.code !== 0) {
      throw new ProjectGitError(result.stderr.trim() || "Git diff failed.")
    }
    patch = result.stdout
  }

  return {
    path: file.path,
    originalPath: file.originalPath,
    hunks: patch ? [patch] : [],
  }
}
