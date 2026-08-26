import assert from "node:assert/strict"
import test from "node:test"

import {
  fileMutationToolKind,
  fileMutationToolPresentation,
} from "./file-mutation-tool"

test("recognizes the built-in file mutation tools", () => {
  assert.equal(fileMutationToolKind("write"), "write")
  assert.equal(fileMutationToolKind("edit"), "edit")
  assert.equal(fileMutationToolKind("insert"), "insert")
  assert.equal(fileMutationToolKind("replace"), "replace")
  assert.equal(fileMutationToolKind("read"), null)
})

test("presents an edit result as a line-numbered unified patch", () => {
  assert.deepEqual(
    fileMutationToolPresentation(
      "edit",
      {
        path: "src/example.ts",
        edits: [{ oldText: "const old = 1", newText: "const next = 2" }],
      },
      {
        patch: [
          "--- src/example.ts",
          "+++ src/example.ts",
          "@@ -1 +1 @@",
          "-const old = 1",
          "+const next = 2",
        ].join("\n"),
      },
      "en-US"
    ),
    {
      kind: "edit",
      label: "edit",
      path: "src/example.ts",
      patch: [
        "--- src/example.ts",
        "+++ src/example.ts",
        "@@ -1 +1 @@",
        "-const old = 1",
        "+const next = 2",
      ].join("\n"),
      additions: 1,
      deletions: 1,
      previews: [
        {
          mode: "diff",
          removed: ["const old = 1"],
          added: ["const next = 2"],
        },
      ],
    }
  )
})

test("uses write content as a readable addition preview", () => {
  assert.deepEqual(
    fileMutationToolPresentation(
      "write",
      { path: "src/new.ts", content: "first\nsecond\n" },
      undefined,
      "zh-CN"
    ),
    {
      kind: "write",
      label: "write",
      path: "src/new.ts",
      previews: [{ mode: "content", removed: [], added: ["first", "second"] }],
    }
  )
})

test("uses hashline metrics and compact diff for insert results", () => {
  const presentation = fileMutationToolPresentation(
    "insert",
    {
      path: "src/example.ts",
      lines: ["const inserted = true"],
    },
    {
      diff: " before\n+new│const inserted = true\n after",
      metrics: { added_lines: 1, removed_lines: 0 },
    },
    "en-US"
  )

  assert.equal(presentation.diff, " before\n+new│const inserted = true\n after")
  assert.equal(presentation.additions, 1)
  assert.equal(presentation.deletions, 0)
})
