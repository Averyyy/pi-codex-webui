import assert from "node:assert/strict"
import test from "node:test"

import {
  clearWorkspaceNavDragSource,
  getWorkspaceNavDragSource,
  moveWorkspaceNavItems,
  sameWorkspaceNavOrderScope,
  setWorkspaceNavDragSource,
  type WorkspaceNavOrderMutation,
} from "./workspace-nav-order"

function mutation(
  overrides: Partial<WorkspaceNavOrderMutation> = {}
): WorkspaceNavOrderMutation {
  return {
    scope: "tasks",
    itemId: "source",
    targetId: "target",
    position: "before",
    ...overrides,
  }
}

test("drag source store supports set, replacement, and clear lifecycle", () => {
  clearWorkspaceNavDragSource()
  try {
    assert.equal(getWorkspaceNavDragSource(), null)

    const first = {
      scope: "projects" as const,
      itemId: "pinned-a",
      projectPinned: true,
    }
    setWorkspaceNavDragSource(first)
    assert.deepEqual(getWorkspaceNavDragSource(), first)

    const replacement = {
      scope: "project" as const,
      projectId: "project-a",
      itemId: "session-a",
    }
    setWorkspaceNavDragSource(replacement)
    assert.deepEqual(getWorkspaceNavDragSource(), replacement)

    clearWorkspaceNavDragSource()
    assert.equal(getWorkspaceNavDragSource(), null)
  } finally {
    clearWorkspaceNavDragSource()
  }
})

test("project drag scope stays within the pinned or normal project group", () => {
  const pinnedProject = mutation({
    scope: "projects",
    itemId: "pinned-a",
    targetId: "pinned-b",
  })
  const normalProject = mutation({
    scope: "projects",
    itemId: "normal-a",
    targetId: "normal-b",
  })

  assert.equal(
    sameWorkspaceNavOrderScope(
      { ...pinnedProject, projectPinned: true },
      { ...pinnedProject, projectPinned: true }
    ),
    true
  )
  assert.equal(
    sameWorkspaceNavOrderScope(
      { ...normalProject, projectPinned: false },
      { ...normalProject, projectPinned: false }
    ),
    true
  )
  assert.equal(
    sameWorkspaceNavOrderScope(
      { ...pinnedProject, projectPinned: true },
      { ...normalProject, projectPinned: false }
    ),
    false
  )

  const pinnedFirst = [
    { id: "pinned-a", projectPinned: true },
    { id: "pinned-b", projectPinned: true },
    { id: "normal-a", projectPinned: false },
    { id: "normal-b", projectPinned: false },
  ]
  const movedPinned = moveWorkspaceNavItems(
    pinnedFirst.filter((project) => project.projectPinned),
    { itemId: "pinned-b", targetId: "pinned-a", position: "before" }
  )
  const movedNormal = moveWorkspaceNavItems(
    pinnedFirst.filter((project) => !project.projectPinned),
    { itemId: "normal-b", targetId: "normal-a", position: "before" }
  )
  assert.deepEqual(
    [...movedPinned, ...movedNormal].map((project) => project.id),
    ["pinned-b", "pinned-a", "normal-b", "normal-a"]
  )
})

test("drag scope compatibility requires the same project and order scope", () => {
  assert.equal(
    sameWorkspaceNavOrderScope(
      mutation({ scope: "project", projectId: "project-a" }),
      mutation({ scope: "project", projectId: "project-a" })
    ),
    true
  )
  assert.equal(
    sameWorkspaceNavOrderScope(
      mutation({ scope: "project", projectId: "project-a" }),
      mutation({ scope: "project", projectId: "project-b" })
    ),
    false
  )
  assert.equal(
    sameWorkspaceNavOrderScope(
      mutation({ scope: "tasks" }),
      mutation({ scope: "pinned" })
    ),
    false
  )
})

test("moving items before or after a target preserves input order", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]

  assert.deepEqual(
    moveWorkspaceNavItems(items, {
      itemId: "d",
      targetId: "b",
      position: "before",
    }).map((item) => item.id),
    ["a", "d", "b", "c"]
  )
  assert.deepEqual(
    moveWorkspaceNavItems(items, {
      itemId: "a",
      targetId: "c",
      position: "after",
    }).map((item) => item.id),
    ["b", "c", "a", "d"]
  )
  assert.deepEqual(
    items.map((item) => item.id),
    ["a", "b", "c", "d"]
  )
})

test("moving an unknown or identical item is a non-mutating no-op", () => {
  const items = [{ id: "a" }, { id: "b" }]
  const missing = moveWorkspaceNavItems(items, {
    itemId: "missing",
    targetId: "b",
    position: "before",
  })
  const identical = moveWorkspaceNavItems(items, {
    itemId: "a",
    targetId: "a",
    position: "after",
  })

  assert.deepEqual(missing, items)
  assert.deepEqual(identical, items)
  assert.notEqual(missing, items)
  assert.notEqual(identical, items)
})
