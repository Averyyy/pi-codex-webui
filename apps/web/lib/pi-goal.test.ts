import assert from "node:assert/strict"
import test from "node:test"

import { latestPiGoalState } from "./pi-goal"

const goal = {
  id: "goal-1",
  text: "Ship the persistent goal bar",
  status: "active",
  startedAt: 1,
  updatedAt: 2,
  iteration: 0,
  tokensUsed: 12,
  timeUsedSeconds: 3,
  activeStartedAt: 2,
}

test("reads the latest goal state from the active branch", () => {
  assert.deepEqual(
    latestPiGoalState([
      { type: "custom", customType: "goal-state", data: { goal } },
    ]),
    { goal, queue: [] }
  )
})

test("a cleared goal hides the persistent bar", () => {
  assert.equal(
    latestPiGoalState([
      { type: "custom", customType: "goal-state", data: { goal } },
      { type: "custom", customType: "goal-state", data: { goal: null } },
    ]),
    null
  )
})
