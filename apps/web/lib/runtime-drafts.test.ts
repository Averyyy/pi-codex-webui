import assert from "node:assert/strict"
import test from "node:test"

import { EventHub } from "./event-hub"
import {
  RuntimeSupervisor,
  type RuntimeDraftClaimResult,
} from "./runtime-supervisor"

function internals(supervisor: RuntimeSupervisor) {
  return supervisor as unknown as {
    runtimeDrafts: Map<string, DraftFixture>
    completeRuntimeDraftClaim: (
      ...args: never[]
    ) => Promise<RuntimeDraftClaimResult>
    disposeRuntimeDraft: (draft: DraftFixture) => Promise<void>
  }
}

interface DraftFixture {
  draftId: string
  leaseToken: string
  leaseExpiries: Map<string, number>
  projectId: string | null
  cwd: string
  runtimeProfileId: string
  runtimeKind: "pi" | "pi-client"
  draftDirectory: string
  runtime: {
    webSessionId: string
    status: string
    cleaned: boolean
    snapshot: RuntimeDraftClaimResult["snapshot"] | null
    runtimeLeases: Map<string, number>
  }
  claimPromise: Promise<RuntimeDraftClaimResult> | null
  claimResult: RuntimeDraftClaimResult | null
  claimFingerprint: string | null
  claimFailure: { code: string; message: string } | null
  claimedAt: number | null
}

function draft(overrides: Partial<DraftFixture["runtime"]> = {}): DraftFixture {
  const runtime = {
    webSessionId: "runtime-session",
    status: "ready",
    cleaned: false,
    snapshot: null,
    runtimeLeases: new Map(),
    ...overrides,
  }
  return {
    draftId: "draft-1",
    leaseToken: "token-1",
    leaseExpiries: new Map([["lease-1", Date.now() + 60_000]]),
    projectId: null,
    cwd: "C:/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
    draftDirectory: "C:/runtime-draft",
    runtime,
    claimPromise: null,
    claimResult: null,
    claimFingerprint: null,
    claimFailure: null,
    claimedAt: null,
  }
}

function claimInput(message = "hello") {
  return {
    draftId: "draft-1",
    leaseToken: "token-1",
    leaseId: "lease-1",
    message,
    images: [],
  }
}

test("concurrent draft claims reuse one operation and reject a changed payload", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = draft()
  state.runtimeDrafts.set(managed.draftId, managed)

  let resolveClaim!: (result: RuntimeDraftClaimResult) => void
  let claimCalls = 0
  state.completeRuntimeDraftClaim = () => {
    claimCalls += 1
    return new Promise((resolve) => {
      resolveClaim = resolve
    })
  }
  const result: RuntimeDraftClaimResult = {
    projectId: null,
    sessionId: "session-1",
    snapshot: {} as RuntimeDraftClaimResult["snapshot"],
  }

  const first = supervisor.claimRuntimeDraft(claimInput())
  const second = supervisor.claimRuntimeDraft(claimInput())
  assert.equal(claimCalls, 1)
  await assert.rejects(
    supervisor.claimRuntimeDraft(claimInput("different")),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "RuntimeDraftConflict"
  )

  resolveClaim(result)
  assert.deepEqual(await first, result)
  assert.deepEqual(await second, result)
})

test("a released claimed draft retains an idempotent claim receipt", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = draft()
  const result: RuntimeDraftClaimResult = {
    projectId: null,
    sessionId: "session-2",
    snapshot: {} as RuntimeDraftClaimResult["snapshot"],
  }
  managed.claimResult = result
  managed.claimFingerprint = JSON.stringify({
    message: "hello",
    images: [],
    model: null,
    thinkingLevel: null,
  })
  state.runtimeDrafts.set(managed.draftId, managed)
  let disposed = 0
  state.disposeRuntimeDraft = async () => {
    disposed += 1
  }

  await supervisor.releaseRuntimeDraft("draft-1", "token-1", "lease-1")
  assert.equal(disposed, 0)
  assert.equal(state.runtimeDrafts.has("draft-1"), true)
  assert.deepEqual(await supervisor.claimRuntimeDraft(claimInput()), result)
})

test("an uncertain prompt claim is replayed as an explicit error", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = draft()
  managed.claimFingerprint = JSON.stringify({
    message: "hello",
    images: [],
    model: null,
    thinkingLevel: null,
  })
  managed.claimFailure = {
    code: "RuntimeDraftClaimUncertain",
    message: "The prompt result is uncertain.",
  }
  state.runtimeDrafts.set(managed.draftId, managed)

  await assert.rejects(
    supervisor.claimRuntimeDraft(claimInput()),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "RuntimeDraftClaimUncertain"
  )
})
