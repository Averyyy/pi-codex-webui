import assert from "node:assert/strict"
import test from "node:test"

import {
  applySessionEntityUpdate,
  sessionNameEntityUpdate,
  type SessionPageEntityCollection,
} from "@/lib/session-catalog-events"

interface SessionRow {
  id: string
  title: string | null
  hasUnreadCompletion: boolean
}

test("session entity updates patch only the addressed loaded row", () => {
  const first: SessionRow = {
    id: "session-a",
    title: "Before",
    hasUnreadCompletion: false,
  }
  const other: SessionRow = {
    id: "session-b",
    title: "Other",
    hasUnreadCompletion: false,
  }
  const page: SessionPageEntityCollection<SessionRow> = {
    sessions: [first, other],
    nextCursor: "cursor-2",
  }

  const updated = applySessionEntityUpdate(page, {
    sessionId: "session-a",
    title: "After",
    hasUnreadCompletion: true,
  })

  assert.notEqual(updated, page)
  assert.notEqual(updated.sessions[0], first)
  assert.deepEqual(updated.sessions[0], {
    ...first,
    title: "After",
    hasUnreadCompletion: true,
  })
  assert.equal(updated.sessions[1], other)
  assert.equal(updated.nextCursor, page.nextCursor)
  assert.equal(
    applySessionEntityUpdate(page, { sessionId: "missing", title: "No row" }),
    page
  )
  assert.equal(
    applySessionEntityUpdate(page, {
      sessionId: "session-a",
      title: "Before",
      hasUnreadCompletion: false,
    }),
    page
  )
})

test("Pi session name changes patch the matching sidebar entity", () => {
  const update = sessionNameEntityUpdate("session-a", {
    type: "session_info_changed",
    name: "Desktop UI Audit",
  })
  const page: SessionPageEntityCollection<SessionRow> = {
    sessions: [
      { id: "session-a", title: null, hasUnreadCompletion: false },
      { id: "session-b", title: null, hasUnreadCompletion: false },
    ],
    nextCursor: null,
  }
  assert.deepEqual(
    applySessionEntityUpdate(page, update).sessions.map(
      (session) => session.title
    ),
    ["Desktop UI Audit", null]
  )
  assert.deepEqual(
    sessionNameEntityUpdate("session-a", { type: "session_info_changed" }),
    { sessionId: "session-a", title: null }
  )
  assert.throws(
    () =>
      sessionNameEntityUpdate("session-a", {
        type: "session_info_changed",
        name: 42,
      }),
    /Invalid Pi session name change event/
  )
})
