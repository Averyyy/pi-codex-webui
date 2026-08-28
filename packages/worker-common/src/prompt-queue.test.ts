import assert from "node:assert/strict"
import test from "node:test"

import { PromptQueue } from "./prompt-queue.js"

test("queued prompts keep send order across follow-up and steer states", () => {
  const queue = new PromptQueue()
  queue.begin("followUp", "first", [])
  const first = queue.reconcile({ steering: [], followUp: ["first"] })[0]!
  queue.begin("followUp", "second", [])
  const initial = queue.reconcile({
    steering: [],
    followUp: ["first", "second"],
  })

  const replacement = queue.prepareReplacement(initial, [
    { ...first, mode: "steer" },
    initial[1]!,
  ])
  queue.commit(replacement.next)

  assert.deepEqual(
    queue.snapshot().map(({ text, mode }) => ({ text, mode })),
    [
      { text: "first", mode: "steer" },
      { text: "second", mode: "followUp" },
    ]
  )
})

test("editing a queued prompt preserves its attached images", () => {
  const queue = new PromptQueue()
  queue.begin("followUp", "original", [
    { type: "image", data: "image-data", mimeType: "image/png" },
  ])
  const current = queue.reconcile({
    steering: [],
    followUp: ["original"],
  })
  const replacement = queue.prepareReplacement(current, [
    { ...current[0]!, text: "edited" },
  ])

  assert.deepEqual(replacement.next[0]?.images, [
    { type: "image", data: "image-data", mimeType: "image/png" },
  ])
})

test("consumed prompts disappear from the editable queue in FIFO order", () => {
  const queue = new PromptQueue()
  queue.begin("steer", "first", [])
  queue.reconcile({ steering: ["first"], followUp: [] })
  queue.begin("steer", "second", [])
  queue.reconcile({ steering: ["first", "second"], followUp: [] })

  assert.deepEqual(
    queue
      .reconcile({ steering: ["second"], followUp: [] })
      .map(({ text, mode }) => ({ text, mode })),
    [{ text: "second", mode: "steer" }]
  )
})

test("stale edits fail instead of overwriting a newer queue", () => {
  const queue = new PromptQueue()
  queue.begin("followUp", "first", [])
  const stale = queue.reconcile({ steering: [], followUp: ["first"] })
  queue.begin("followUp", "second", [])
  queue.reconcile({ steering: [], followUp: ["first", "second"] })

  assert.throws(
    () => queue.prepareReplacement(stale, stale),
    (error: Error) => error.name === "QueueConflict"
  )
})

test("queue replacement cannot drop a prompt that is still being admitted", () => {
  const queue = new PromptQueue()
  queue.begin("followUp", "first", [])
  const visible = queue.reconcile({ steering: [], followUp: ["first"] })
  queue.begin("followUp", "second", [
    { type: "image", data: "image-data", mimeType: "image/png" },
  ])

  assert.throws(
    () => queue.prepareReplacement(visible, visible),
    (error: Error) =>
      error.name === "QueueConflict" && /正在加入队列/.test(error.message)
  )

  const reconciled = queue.reconcile({
    steering: [],
    followUp: ["first", "second"],
  })
  assert.equal(reconciled.length, 2)
  assert.equal(reconciled[1]?.text, "second")
})

test("control queue entries are visible and same controls replace in place", () => {
  const queue = new PromptQueue()
  queue.upsertControl("followUp", "/model openai/gpt-4o", {
    type: "model",
    value: "openai/gpt-4o",
  })
  const first = queue.snapshot()
  assert.equal(first.length, 1)
  assert.equal(first[0]?.kind, "control")
  const firstId = first[0]?.id

  queue.upsertControl("followUp", "/model openai/gpt-4.1", {
    type: "model",
    value: "openai/gpt-4.1",
  })
  const replaced = queue.snapshot()
  assert.equal(replaced.length, 1)
  assert.equal(replaced[0]?.id, firstId)
  assert.equal(replaced[0]?.control?.value, "openai/gpt-4.1")
})
