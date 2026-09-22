import assert from "node:assert/strict"
import test from "node:test"

import { EventHub } from "./event-hub"
import { RuntimeSupervisor } from "./runtime-supervisor"

test("idle recycling preserves a leased runtime until its lease expires", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = supervisor as unknown as {
    runtimes: Map<
      string,
      {
        webSessionId: string
        status: string
        cleaned: boolean
        lastActivityAt: number
        runtimeLeases: Map<string, number>
        child: { kill(): boolean }
      }
    >
    stop: (sessionId: string) => Promise<void>
    recycleIdleRuntimes: () => void
  }
  const runtime = {
    webSessionId: "session-a",
    status: "ready",
    cleaned: false,
    lastActivityAt: Date.now() - 16 * 60_000,
    runtimeLeases: new Map<string, number>(),
    child: { kill: () => true },
  }
  state.runtimes.set(runtime.webSessionId, runtime)
  let stops = 0
  state.stop = async () => {
    stops += 1
  }

  await supervisor.retainRuntimeLease("session-a", "owner-a")
  state.recycleIdleRuntimes()
  assert.equal(stops, 0)

  runtime.runtimeLeases.set("owner-a", Date.now() - 1)
  runtime.lastActivityAt = Date.now() - 16 * 60_000
  state.recycleIdleRuntimes()
  assert.equal(stops, 1)
})

test("idle recycling delegates unclaimed drafts to their own lease reaper", () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = supervisor as unknown as {
    runtimes: Map<
      string,
      {
        webSessionId: string
        status: string
        cleaned: boolean
        lastActivityAt: number
        runtimeLeases: Map<string, number>
        child: { kill(): boolean }
      }
    >
    runtimeDrafts: Map<
      string,
      {
        draftId: string
        leaseExpiries: Map<string, number>
        claimPromise: null
        claimResult: null
        claimFailure: null
        claimedAt: null
        runtime: {
          webSessionId: string
          status: string
          cleaned: boolean
          lastActivityAt: number
          runtimeLeases: Map<string, number>
        }
      }
    >
    stop: (sessionId: string) => Promise<void>
    disposeRuntimeDraft: (draft: unknown) => Promise<void>
    recycleIdleRuntimes: () => void
  }
  const runtime = {
    webSessionId: "draft-runtime",
    status: "ready",
    cleaned: false,
    lastActivityAt: Date.now() - 16 * 60_000,
    runtimeLeases: new Map<string, number>(),
    child: { kill: () => true },
  }
  const draft = {
    draftId: "draft-a",
    leaseExpiries: new Map([["lease-a", Date.now() + 60_000]]),
    claimPromise: null,
    claimResult: null,
    claimFailure: null,
    claimedAt: null,
    runtime,
  }
  state.runtimes.set(runtime.webSessionId, runtime)
  state.runtimeDrafts.set(draft.draftId, draft)
  let disposed = 0
  state.stop = async () => {}
  state.disposeRuntimeDraft = async () => {
    disposed += 1
  }

  state.recycleIdleRuntimes()
  assert.equal(disposed, 0)

  draft.leaseExpiries.set("lease-a", Date.now() - 1)
  state.recycleIdleRuntimes()
  assert.equal(disposed, 1)
})
