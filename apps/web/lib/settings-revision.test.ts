import assert from "node:assert/strict"
import test from "node:test"

import { newestSettingsRevision } from "@/lib/settings-revision"

test("newer settings responses replace the current view", () => {
  const current = { revision: 4, value: "old" }
  const incoming = { revision: 5, value: "new" }

  assert.equal(newestSettingsRevision(current, incoming), incoming)
})

test("equal revisions can refresh runtime-only settings state", () => {
  const current = { revision: 5, status: "starting" }
  const incoming = { revision: 5, status: "ready" }

  assert.equal(newestSettingsRevision(current, incoming), incoming)
})

test("late older settings responses cannot overwrite newer state", () => {
  const current = { revision: 6, value: "saved" }
  const incoming = { revision: 5, value: "stale" }

  assert.equal(newestSettingsRevision(current, incoming), current)
})
