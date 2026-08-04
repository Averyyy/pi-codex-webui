import assert from "node:assert/strict"
import test from "node:test"

import {
  isWorkspaceNavItemVisible,
  workspaceNavFocusTarget,
} from "@/lib/workspace-nav-focus"

test("navigation visibility uses rendered boxes without checkVisibility", () => {
  assert.equal(
    isWorkspaceNavItemVisible({ getClientRects: () => ({ length: 1 }) }),
    true
  )
  assert.equal(
    isWorkspaceNavItemVisible({ getClientRects: () => ({ length: 0 }) }),
    false
  )
})

test("pin mutations retain the destination action as their focus target", () => {
  assert.deepEqual(
    workspaceNavFocusTarget(
      {
        kind: "pin",
        sessionId: "session-b",
        pinned: true,
        projectId: "project-a",
      },
      ["/a", "/b"]
    ),
    {
      kind: "pin",
      sessionId: "session-b",
      pinned: true,
      projectId: "project-a",
    }
  )
})

test("archive focuses the next visible conversation", () => {
  assert.deepEqual(
    workspaceNavFocusTarget(
      {
        kind: "archive",
        sessionId: "session-b",
        href: "/b",
        navigateHome: false,
      },
      ["/a", "/b", "/c"]
    ),
    { kind: "session", href: "/c", archivedSessionId: "session-b" }
  )
})

test("archive falls back to the previous visible conversation", () => {
  assert.deepEqual(
    workspaceNavFocusTarget(
      {
        kind: "archive",
        sessionId: "session-b",
        href: "/b",
        navigateHome: false,
      },
      ["/a", "/b"]
    ),
    { kind: "session", href: "/a", archivedSessionId: "session-b" }
  )
})

test("archive focuses new conversation when no visible neighbor remains", () => {
  assert.deepEqual(
    workspaceNavFocusTarget(
      {
        kind: "archive",
        sessionId: "session-a",
        href: "/a",
        navigateHome: false,
      },
      ["/a"]
    ),
    { kind: "new", archivedSessionId: "session-a" }
  )
})

test("archiving the active conversation focuses new conversation", () => {
  assert.deepEqual(
    workspaceNavFocusTarget(
      {
        kind: "archive",
        sessionId: "session-b",
        href: "/b",
        navigateHome: true,
      },
      ["/a", "/b", "/c"]
    ),
    { kind: "new", archivedSessionId: "session-b" }
  )
})
