import assert from "node:assert/strict"
import test from "node:test"

import {
  hashlineEditToolKind,
  hashlineEditToolPresentation,
} from "./hashline-edit-tool.js"

test("recognizes only hashline replace and undo calls", () => {
  assert.equal(
    hashlineEditToolKind("replace", {
      path: "src/main.ts",
      changes: [],
    }),
    "replace"
  )
  assert.equal(
    hashlineEditToolKind("replace", {
      path: "src/main.ts",
      content_lines: ["const answer = 42"],
      hash_range_inclusive: ["MQX", "MQX"],
    }),
    "replace"
  )
  assert.equal(
    hashlineEditToolKind("undo_last_replace", { path: "src/main.ts" }),
    "undo"
  )

  assert.equal(
    hashlineEditToolKind("replace", {
      path: "src/main.ts",
      oldText: "before",
      newText: "after",
    }),
    null
  )
  assert.equal(
    hashlineEditToolKind("read", {
      path: "src/main.ts",
      hash_range_inclusive: ["MQX", "MQX"],
      content_lines: [],
    }),
    null
  )
})

test("presents bulk replace requests and the 0.18.1 result details", () => {
  assert.deepEqual(
    hashlineEditToolPresentation(
      "replace",
      {
        path: "src/main.ts",
        changes: [
          {
            content_lines: ["const answer = 42", "export { answer }"],
            hash_range_inclusive: ["MQX", "VRW"],
          },
          {
            content_lines: [],
            hash_range_inclusive: ["aB3", "xY7"],
          },
        ],
      },
      {
        diff: "-   │const answer = 1\n+AbC│const answer = 42",
        firstChangedLine: 7,
        snapshotId: "snapshot-2",
        metrics: {
          edits_attempted: 2,
          edits_noop: 1,
          warnings: 1,
          classification: "applied",
          changed_lines: { first: 7, last: 9 },
          added_lines: 2,
          removed_lines: 1,
        },
      }
    ),
    {
      kind: "replace",
      label: "Hashline 替换",
      preview: "src/main.ts",
      path: "src/main.ts",
      requests: [
        {
          index: 1,
          anchorRange: "MQX → VRW",
          replacementLines: 2,
        },
        {
          index: 2,
          anchorRange: "aB3 → xY7",
          replacementLines: 0,
        },
      ],
      facts: [
        { label: "请求", value: "2 处" },
        { label: "应用", value: "1/2 处" },
        { label: "结果", value: "已应用" },
        { label: "行数", value: "+2 / −1" },
        { label: "范围", value: "第 7–9 行" },
        { label: "警告", value: "1 条" },
        { label: "快照", value: "snapshot-2" },
      ],
      diff: "-   │const answer = 1\n+AbC│const answer = 42",
      classification: "applied",
    }
  )
})

test("presents flat replace no-op details without inventing a diff", () => {
  const presentation = hashlineEditToolPresentation(
    "replace",
    {
      path: "src/main.ts",
      content_lines: ["unchanged"],
      hash_range_inclusive: ["MQX", "MQX"],
    },
    {
      diff: "",
      classification: "noop",
      snapshotId: "snapshot-1",
      metrics: {
        edits_attempted: 1,
        edits_noop: 1,
        warnings: 0,
        classification: "noop",
      },
    }
  )

  assert.equal(presentation.classification, "noop")
  assert.equal(presentation.diff, undefined)
  assert.deepEqual(presentation.requests, [
    {
      index: 1,
      anchorRange: "MQX → MQX",
      replacementLines: 1,
    },
  ])
  assert.deepEqual(presentation.facts, [
    { label: "请求", value: "1 处" },
    { label: "应用", value: "0/1 处" },
    { label: "结果", value: "无变更" },
    { label: "快照", value: "snapshot-1" },
  ])
})

test("uses undo metrics as restored and removed line counts", () => {
  const presentation = hashlineEditToolPresentation(
    "undo",
    { path: "src/main.ts" },
    {
      metrics: {
        edits_attempted: 1,
        edits_noop: 0,
        warnings: 0,
        classification: "applied",
        added_lines: 3,
        removed_lines: 5,
      },
    }
  )

  assert.deepEqual(presentation, {
    kind: "undo",
    label: "撤销 Hashline 替换",
    preview: "src/main.ts",
    path: "src/main.ts",
    requests: [],
    facts: [
      { label: "结果", value: "已应用" },
      { label: "恢复", value: "3 行" },
      { label: "移除", value: "5 行" },
    ],
    undoSummary: "恢复 3 行，移除 5 行",
    classification: "applied",
  })
})
