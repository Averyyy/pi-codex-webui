import assert from "node:assert/strict"
import test from "node:test"

import type { SessionPage } from "@/lib/session-types"
import {
  appendSessionPage,
  applyPendingSessionEntityUpdates,
  clearConfirmedSessionEntityUpdates,
  mergeSessionEntityUpdateOverlay,
  sessionPageQueryIdentity,
  type SessionEntityUpdateOverlay,
} from "@/lib/session-page-data"

function row(id: string, title: string, hasUnreadCompletion = false) {
  return { id, title, hasUnreadCompletion } as SessionPage["sessions"][number]
}

test("session list identity excludes server row snapshots and includes explicit invalidation", () => {
  const first: SessionPage = {
    sessions: [row("a", "Before"), row("b", "Other")],
    nextCursor: "next",
  }
  const entityOnlyChange: SessionPage = {
    sessions: [row("a", "After", true), row("b", "Other")],
    nextCursor: "next",
  }
  const membershipChange: SessionPage = {
    sessions: [row("a", "After", true), row("c", "New")],
    nextCursor: "next",
  }

  const initialKey = sessionPageQueryIdentity(
    "project",
    "project-a",
    true,
    "",
    0
  )
  assert.equal(
    initialKey,
    sessionPageQueryIdentity("project", "project-a", true, "", 0)
  )
  assert.equal(first.sessions.length, entityOnlyChange.sessions.length)
  assert.equal(membershipChange.sessions[1]?.id, "c")
  assert.notEqual(
    initialKey,
    sessionPageQueryIdentity("project", "project-a", true, "", 1)
  )
  assert.notEqual(
    initialKey,
    sessionPageQueryIdentity("project", "project-b", true, "", 0)
  )
})

test("entity patches that arrive during a page request survive its stale response", () => {
  const loaded: SessionPage = {
    sessions: [row("a", "Old title")],
    nextCursor: "next",
  }
  const response: SessionPage = {
    sessions: [row("a", "Old title"), row("b", "B")],
    nextCursor: null,
  }
  const updates = new Map<string, SessionEntityUpdateOverlay>([
    [
      "a",
      {
        sessionId: "a",
        revision: 2,
        title: { value: "Renamed while loading", revision: 1 },
        hasUnreadCompletion: { value: true, revision: 2 },
      },
    ],
  ])
  const appended = appendSessionPage(loaded, response)
  const current = applyPendingSessionEntityUpdates(appended, updates, 0)

  assert.equal(current.sessions[0]?.title, "Renamed while loading")
  assert.equal(current.sessions[0]?.hasUnreadCompletion, true)
  assert.deepEqual(
    current.sessions.map((session) => session.id),
    ["a", "b"]
  )
})

test("rename and unread patches merge per field while a reload is pending", () => {
  const rename = mergeSessionEntityUpdateOverlay(
    undefined,
    { sessionId: "a", title: "Renamed during reload" },
    1
  )
  const update = mergeSessionEntityUpdateOverlay(
    rename,
    { sessionId: "a", hasUnreadCompletion: true },
    2
  )
  const overlays = new Map([["a", update]])
  const staleResponse: SessionPage = {
    sessions: [row("a", "Old title", false)],
    nextCursor: null,
  }

  const current = applyPendingSessionEntityUpdates(staleResponse, overlays, 0)

  assert.equal(current.sessions[0]?.title, "Renamed during reload")
  assert.equal(current.sessions[0]?.hasUnreadCompletion, true)
})

test("a stale page overlays only entity fields changed after its request began", () => {
  const rename = mergeSessionEntityUpdateOverlay(
    undefined,
    { sessionId: "a", title: "Renamed before reload" },
    1
  )
  const update = mergeSessionEntityUpdateOverlay(
    rename,
    { sessionId: "a", hasUnreadCompletion: true },
    2
  )
  const overlays = new Map([["a", update]])
  const response: SessionPage = {
    sessions: [row("a", "Renamed before reload", false)],
    nextCursor: null,
  }
  const captured = new Map(overlays)

  const current = applyPendingSessionEntityUpdates(response, overlays, 1)
  clearConfirmedSessionEntityUpdates(overlays, captured, ["a"])

  assert.equal(current.sessions[0]?.title, "Renamed before reload")
  assert.equal(current.sessions[0]?.hasUnreadCompletion, true)
  assert.equal(overlays.has("a"), false)
})

test("applying a captured overlay twice is pure and cleanup preserves later field updates", () => {
  const rename = mergeSessionEntityUpdateOverlay(
    undefined,
    { sessionId: "a", title: "First rename" },
    1
  )
  const captured = new Map<string, SessionEntityUpdateOverlay>([["a", rename]])
  const response: SessionPage = {
    sessions: [row("a", "Old title", false)],
    nextCursor: null,
  }

  const firstApply = applyPendingSessionEntityUpdates(response, captured, 0)
  const secondApply = applyPendingSessionEntityUpdates(response, captured, 0)
  assert.deepEqual(secondApply, firstApply)
  assert.equal(captured.has("a"), true)

  const newerUnread = mergeSessionEntityUpdateOverlay(
    rename,
    { sessionId: "a", hasUnreadCompletion: true },
    2
  )
  const current = new Map<string, SessionEntityUpdateOverlay>([
    ["a", newerUnread],
  ])
  clearConfirmedSessionEntityUpdates(current, captured, ["a"])
  assert.deepEqual(current.get("a"), {
    sessionId: "a",
    revision: 2,
    hasUnreadCompletion: { value: true, revision: 2 },
  })
})

test("an authoritative page response clears an older entity overlay for included rows", () => {
  const updates = new Map<string, SessionEntityUpdateOverlay>([
    [
      "a",
      {
        sessionId: "a",
        revision: 1,
        title: { value: "Old local patch", revision: 1 },
      },
    ],
  ])
  const page: SessionPage = {
    sessions: [row("a", "Server title")],
    nextCursor: null,
  }
  const captured = new Map(updates)

  const result = applyPendingSessionEntityUpdates(page, updates, 1)
  clearConfirmedSessionEntityUpdates(updates, captured, ["a"])

  assert.equal(result.sessions[0]?.title, "Server title")
  assert.equal(updates.has("a"), false)
})
