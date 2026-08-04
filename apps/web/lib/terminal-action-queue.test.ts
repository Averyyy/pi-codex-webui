import assert from "node:assert/strict"
import test from "node:test"

import { TerminalActionQueue } from "./terminal-action-queue"

test("reports action failures while the terminal remains active", async () => {
  const attempted: string[] = []
  const errors: unknown[] = []
  const queue = new TerminalActionQueue<string>(
    async (action) => {
      attempted.push(action)
      if (action === "fail") throw new Error("failed")
    },
    (error) => errors.push(error)
  )

  await queue.enqueue("fail")
  await queue.enqueue("next")

  assert.deepEqual(attempted, ["fail", "next"])
  assert.equal((errors[0] as Error | undefined)?.message, "failed")
})

test("drops queued actions and errors after terminal disposal", async () => {
  const attempted: string[] = []
  const errors: unknown[] = []
  let rejectRunning!: (error: Error) => void
  const queue = new TerminalActionQueue<string>(
    async (action, signal) => {
      attempted.push(action)
      assert.equal(signal.aborted, false)
      await new Promise<void>((_resolve, reject) => {
        rejectRunning = reject
      })
    },
    (error) => errors.push(error)
  )

  const running = queue.enqueue("running")
  await Promise.resolve()
  const queued = queue.enqueue("queued")
  queue.dispose()
  rejectRunning(new Error("stopped"))
  await Promise.all([running, queued, queue.enqueue("late")])

  assert.equal(queue.signal.aborted, true)
  assert.deepEqual(attempted, ["running"])
  assert.deepEqual(errors, [])
})
