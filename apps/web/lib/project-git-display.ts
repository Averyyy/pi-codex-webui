import type { Locale, MessageKey } from "./i18n"
import { translate } from "./i18n"

export type ProjectGitDiffLine = {
  kind: "meta" | "hunk" | "context" | "addition" | "deletion"
  oldLine: number | null
  newLine: number | null
  content: string
}

export const INITIAL_PROJECT_DIFF_LINES = 400
export const PROJECT_DIFF_LINE_INCREMENT = 800

const knownGitErrors = new Map<string, MessageKey>([
  ["Git executable is not installed.", "project.git.error.notInstalled"],
  [
    "The project is not inside a Git worktree.",
    "project.git.error.notWorktree",
  ],
  [
    "The project directory no longer exists.",
    "project.git.error.directoryMissing",
  ],
  ["Git status failed.", "project.git.error.statusFailed"],
  ["Git divergence check failed.", "project.git.error.divergenceFailed"],
  [
    "The requested path has no working tree changes.",
    "project.git.error.pathNoChanges",
  ],
  ["Git diff failed.", "project.git.error.diffFailed"],
  ["Git diff index initialization failed.", "project.git.error.indexFailed"],
  [
    "Git returned a path outside the registered project.",
    "project.git.error.outsideProject",
  ],
])

export function projectGitErrorCopy(error: string, locale: Locale) {
  const key = knownGitErrors.get(error)
  return key ? translate(locale, key) : error
}

function patchLines(patch: string) {
  const lines = patch.split(/\r?\n/)
  if (lines.at(-1) === "") lines.pop()
  return lines
}

export function parseProjectGitDiff(hunks: string[]) {
  const result: ProjectGitDiffLine[] = []

  for (const patch of hunks) {
    let oldLine: number | null = null
    let newLine: number | null = null

    for (const line of patchLines(patch)) {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (hunk) {
        oldLine = Number(hunk[1])
        newLine = Number(hunk[2])
        result.push({
          kind: "hunk",
          oldLine: null,
          newLine: null,
          content: line,
        })
        continue
      }

      if (oldLine === null || newLine === null || line.startsWith("\\")) {
        result.push({
          kind: "meta",
          oldLine: null,
          newLine: null,
          content: line,
        })
        continue
      }

      if (line.startsWith("+")) {
        result.push({
          kind: "addition",
          oldLine: null,
          newLine,
          content: line.slice(1),
        })
        newLine += 1
        continue
      }

      if (line.startsWith("-")) {
        result.push({
          kind: "deletion",
          oldLine,
          newLine: null,
          content: line.slice(1),
        })
        oldLine += 1
        continue
      }

      result.push({
        kind: "context",
        oldLine,
        newLine,
        content: line.startsWith(" ") ? line.slice(1) : line,
      })
      oldLine += 1
      newLine += 1
    }
  }

  return result
}

export function nextProjectDiffLineLimit(
  current: number,
  total: number,
  increment = PROJECT_DIFF_LINE_INCREMENT
) {
  return Math.min(total, current + increment)
}
