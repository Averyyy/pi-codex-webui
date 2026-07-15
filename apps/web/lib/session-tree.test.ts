import assert from "node:assert/strict"
import test from "node:test"

import type { SessionTree } from "@workspace/runtime-protocol"

import {
  buildSessionTreeRows,
  sessionTreeActiveCount,
  sessionTreeCurrentEntryId,
  sessionTreeEntryCount,
} from "./session-tree"

const timestamp = "2026-07-15T08:00:00.000Z"

function entry(
  id: string,
  parentId: string | null,
  overrides: Partial<SessionTree["entries"][number]> = {}
): SessionTree["entries"][number] {
  return { id, parentId, type: "message", timestamp, ...overrides }
}

const tree: SessionTree = {
  entries: [
    entry("root", null, { role: "user", text: "start" }),
    entry("abandoned", "root", { role: "assistant", text: "old answer" }),
    entry("active", "root", { role: "assistant", text: "new answer" }),
    entry("leaf", "active", { role: "user", text: "continue" }),
  ],
  leafId: "leaf",
}

test("prioritizes the active branch and only indents at a branch point", () => {
  const rows = buildSessionTreeRows(tree, {
    filter: "default",
    query: "",
    foldedIds: new Set(),
  })

  assert.deepEqual(
    rows.map((row) => [row.entry.id, row.depth, row.active]),
    [
      ["root", 0, true],
      ["active", 1, true],
      ["leaf", 1, true],
      ["abandoned", 1, false],
    ]
  )
  assert.equal(rows[1]?.parentIndex, 0)
  assert.equal(rows[2]?.parentIndex, 1)
  assert.equal(rows[0]?.childCount, 2)
  assert.equal(sessionTreeActiveCount(tree), 3)
})

test("filters entries and reconnects matches to the nearest visible ancestor", () => {
  const userRows = buildSessionTreeRows(tree, {
    filter: "user",
    query: "",
    foldedIds: new Set(),
  })
  assert.deepEqual(
    userRows.map((row) => [row.entry.id, row.parentId, row.depth]),
    [
      ["root", null, 0],
      ["leaf", "root", 0],
    ]
  )

  const searchRows = buildSessionTreeRows(tree, {
    filter: "all",
    query: "old answer",
    foldedIds: new Set(),
  })
  assert.deepEqual(
    searchRows.map((row) => row.entry.id),
    ["abandoned"]
  )
})

test("folds descendants at real branch points but expands results while searching", () => {
  const foldedRows = buildSessionTreeRows(tree, {
    filter: "default",
    query: "",
    foldedIds: new Set(["root"]),
  })
  assert.deepEqual(
    foldedRows.map((row) => row.entry.id),
    ["root"]
  )
  assert.equal(foldedRows[0]?.folded, true)

  const searchRows = buildSessionTreeRows(tree, {
    filter: "default",
    query: "answer",
    foldedIds: new Set(["root"]),
  })
  assert.deepEqual(
    searchRows.map((row) => row.entry.id),
    ["active", "abandoned"]
  )
})

test("uses the nearest selectable ancestor when the raw leaf is internal state", () => {
  const settingTree: SessionTree = {
    entries: [
      entry("message", null),
      entry("setting", "message", { type: "thinking_level_change" }),
    ],
    leafId: "setting",
  }
  const rows = buildSessionTreeRows(settingTree, {
    filter: "all",
    query: "",
    foldedIds: new Set(),
  })
  assert.deepEqual(
    rows.map((row) => row.entry.id),
    ["message"]
  )
  assert.equal(rows[0]?.current, true)
  assert.equal(sessionTreeCurrentEntryId(settingTree), "message")
  assert.equal(sessionTreeActiveCount(settingTree), 1)
  assert.equal(sessionTreeEntryCount(settingTree), 1)
})

test("reconnects messages across internal state entries", () => {
  const settingTree: SessionTree = {
    entries: [
      entry("parent", null),
      entry("setting", "parent", { type: "model_change" }),
      entry("child", "setting"),
    ],
    leafId: "child",
  }
  assert.deepEqual(
    buildSessionTreeRows(settingTree, {
      filter: "all",
      query: "",
      foldedIds: new Set(),
    }).map((row) => [row.entry.id, row.parentId]),
    [
      ["parent", null],
      ["child", "parent"],
    ]
  )
})
