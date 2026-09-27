import assert from "node:assert/strict"
import test from "node:test"

import {
  applySessionEntityUpdate,
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
