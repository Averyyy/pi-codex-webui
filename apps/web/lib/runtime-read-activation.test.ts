import assert from "node:assert/strict"
import test from "node:test"

import { EventHub } from "./event-hub"
import { RuntimeSupervisor } from "./runtime-supervisor"

test("web UI view reads wait for a selected runtime activation", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = supervisor as unknown as {
    runtimes: Map<
      string,
      { status: string; cleaned: boolean; child: { kill(): boolean } }
    >
    activations: Map<string, Promise<unknown>>
    request: (...args: never[]) => Promise<unknown>
  }
  const runtime = {
    status: "starting",
    cleaned: false,
    child: { kill: () => true },
  }
  state.runtimes.set("session-a", runtime)
  let finish!: (value: typeof runtime) => void
  const activation = new Promise<typeof runtime>((resolve) => {
    finish = resolve
  })
  state.activations.set("session-a", activation)
  let requests = 0
  state.request = async () => {
    requests += 1
    return []
  }

  let settled = false
  const views = supervisor.webUiViews("session-a").then((value) => {
    settled = true
    return value
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false)

  runtime.status = "ready"
  finish(runtime)
  assert.deepEqual(await views, [])
  assert.equal(requests, 1)
})
