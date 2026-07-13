import "server-only"

import { spawn } from "node:child_process"

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
      files: GitFileStatus[]
    }

type GitResult = { code: number; stdout: string; stderr: string }

function runGit(cwd: string, args: string[]) {
  return new Promise<GitResult>((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], {
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

function parseStatus(output: string) {
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
      path: record.slice(3),
      originalPath: renamed ? (records[++index] ?? null) : null,
    })
  }
  return files
}

export async function readProjectGitStatus(
  projectPath: string
): Promise<ProjectGitStatus> {
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

  return {
    available: true,
    root: root.stdout.trim(),
    branch: commandValue(branch),
    commit: commandValue(commit),
    upstream: upstreamName,
    ahead,
    behind,
    files: parseStatus(status.stdout),
  }
}
