import assert from "node:assert/strict"
import test from "node:test"

import type { QueuedPromptItem } from "@workspace/runtime-protocol"

import { reconcilePromptQueueMutation } from "./prompt-queue-sync"

const original: QueuedPromptItem = {
  id: "queued-1",
  text: "original",
  mode: "followUp",
}
const edited: QueuedPromptItem = { ...original, text: "edited" }

test("uses a queue mutation response when no newer queue state arrived", () => {
  assert.deepEqual(reconcilePromptQueueMutation([original], [edited], 4, 4), [
    edited,
  ])
})

test("does not resurrect a consumed prompt from a late mutation response", () => {
  const consumed: QueuedPromptItem[] = []

  assert.strictEqual(
    reconcilePromptQueueMutation(consumed, [edited], 4, 5),
    consumed
  )
})
