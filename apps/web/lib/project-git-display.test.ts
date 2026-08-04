import assert from "node:assert/strict"
import test from "node:test"

import {
  INITIAL_PROJECT_DIFF_LINES,
  nextProjectDiffLineLimit,
  parseProjectGitDiff,
  projectGitErrorCopy,
} from "./project-git-display"

test("parses unified diffs without losing line numbers or empty content", () => {
  const lines = parseProjectGitDiff([
    [
      "diff --git a/src/example.ts b/src/example.ts",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
      "@@ -1,3 +1,4 @@",
      " unchanged",
      "-old value",
      "+new value",
      "+",
      " tail",
      "\\ No newline at end of file",
      "",
    ].join("\n"),
  ])

  assert.deepEqual(
    lines.map(({ kind, oldLine, newLine, content }) => ({
      kind,
      oldLine,
      newLine,
      content,
    })),
    [
      {
        kind: "meta",
        oldLine: null,
        newLine: null,
        content: "diff --git a/src/example.ts b/src/example.ts",
      },
      {
        kind: "meta",
        oldLine: null,
        newLine: null,
        content: "--- a/src/example.ts",
      },
      {
        kind: "meta",
        oldLine: null,
        newLine: null,
        content: "+++ b/src/example.ts",
      },
      {
        kind: "hunk",
        oldLine: null,
        newLine: null,
        content: "@@ -1,3 +1,4 @@",
      },
      { kind: "context", oldLine: 1, newLine: 1, content: "unchanged" },
      { kind: "deletion", oldLine: 2, newLine: null, content: "old value" },
      { kind: "addition", oldLine: null, newLine: 2, content: "new value" },
      { kind: "addition", oldLine: null, newLine: 3, content: "" },
      { kind: "context", oldLine: 3, newLine: 4, content: "tail" },
      {
        kind: "meta",
        oldLine: null,
        newLine: null,
        content: "\\ No newline at end of file",
      },
    ]
  )
})

test("bounds progressive rendering without discarding the remaining diff", () => {
  assert.equal(
    nextProjectDiffLineLimit(INITIAL_PROJECT_DIFF_LINES, 2_000),
    1_200
  )
  assert.equal(nextProjectDiffLineLimit(1_200, 1_500), 1_500)
})

test("preserves diff-sign content and indentation after the line marker", () => {
  const lines = parseProjectGitDiff([
    [
      "@@ -1,2 +1,2 @@",
      "--literal minus",
      "++literal plus",
      " \tindented",
    ].join("\n"),
  ])

  assert.deepEqual(lines.slice(1), [
    {
      kind: "deletion",
      oldLine: 1,
      newLine: null,
      content: "-literal minus",
    },
    {
      kind: "addition",
      oldLine: null,
      newLine: 1,
      content: "+literal plus",
    },
    {
      kind: "context",
      oldLine: 2,
      newLine: 2,
      content: "\tindented",
    },
  ])
})

test("localizes stable Git errors and preserves diagnostic stderr", () => {
  assert.equal(
    projectGitErrorCopy("The project is not inside a Git worktree.", "zh-CN"),
    "项目不在 Git 工作树中。"
  )
  assert.equal(
    projectGitErrorCopy("fatal: unsafe repository", "en-US"),
    "fatal: unsafe repository"
  )
})
