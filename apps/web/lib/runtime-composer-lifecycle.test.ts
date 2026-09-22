import assert from "node:assert/strict"
import test from "node:test"

import type { RuntimeStatus } from "@workspace/runtime-protocol"

import { EventHub } from "./event-hub"
import {
  RuntimeSupervisor,
  type RuntimeDraftClaimResult,
} from "./runtime-supervisor"

interface RuntimeFixture {
  webSessionId: string
  status: RuntimeStatus
  cleaned: boolean
  lastActivityAt: number
  nativeSessionFile: string
  child: { kill(): void }
  runtimeLeases: Map<string, number>
}

interface ClaimInput {
  draftId: string
  leaseToken: string
  leaseId: string
  message: string
  images: []
  model?: { provider: string; modelId: string }
  thinkingLevel?: RuntimeDraftClaimResult["snapshot"]["thinkingLevel"]
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
  runtime: RuntimeFixture
  claimPromise: Promise<RuntimeDraftClaimResult> | null
  claimResult: RuntimeDraftClaimResult | null
  claimFingerprint: string | null
  claimFailure: { code: string; message: string } | null
  claimedAt: number | null
}

interface RuntimeSupervisorInternals {
  runtimes: Map<string, RuntimeFixture>
  runtimeDrafts: Map<string, DraftFixture>
  recycleIdleRuntimes(): void
  stop(sessionId: string): Promise<void>
  disposeRuntimeDraft(draft: DraftFixture): Promise<void>
  completeRuntimeDraftClaim(
    draft: DraftFixture,
    input: ClaimInput
  ): Promise<RuntimeDraftClaimResult>
}

function internals(supervisor: RuntimeSupervisor) {
  return supervisor as unknown as RuntimeSupervisorInternals
}

function runtime(overrides: Partial<RuntimeFixture> = {}): RuntimeFixture {
  return {
    webSessionId: "runtime-session",
    status: "ready",
    cleaned: false,
    lastActivityAt: Date.now() - 24 * 60 * 60_000,
    nativeSessionFile: "C:/runtime-draft/session.jsonl",
    child: { kill() {} },
    runtimeLeases: new Map(),
    ...overrides,
  }
}

function draft(
  overrides: Partial<DraftFixture> = {},
  runtimeOverrides: Partial<RuntimeFixture> = {}
): DraftFixture {
  return {
    draftId: "draft-1",
    leaseToken: "token-1",
    leaseExpiries: new Map([["lease-1", Date.now() + 60_000]]),
    projectId: null,
    cwd: "C:/workspace",
    runtimeProfileId: "pi",
    runtimeKind: "pi",
    draftDirectory: "C:/runtime-draft",
    runtime: runtime(runtimeOverrides),
    claimPromise: null,
    claimResult: null,
    claimFingerprint: null,
    claimFailure: null,
    claimedAt: null,
    ...overrides,
  }
}

function claimInput(message = "hello"): ClaimInput {
  return {
    draftId: "draft-1",
    leaseToken: "token-1",
    leaseId: "lease-1",
    message,
    images: [],
  }
}

function claimFingerprint(input: ClaimInput) {
  return JSON.stringify({
    message: input.message,
    images: input.images,
    model: input.model ?? null,
    thinkingLevel: input.thinkingLevel ?? null,
  })
}

function runtimeRequestCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

test("selected ready runtimes stay alive only while their lease is active", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const stopped: string[] = []
  state.stop = async (sessionId) => {
    stopped.push(sessionId)
  }
  const managed = runtime({
    runtimeLeases: new Map([["lease-1", Date.now() + 60_000]]),
  })
  state.runtimes.set(managed.webSessionId, managed)

  state.recycleIdleRuntimes()
  await flush()
  assert.deepEqual(stopped, [])
  assert.equal(managed.runtimeLeases.has("lease-1"), true)

  managed.runtimeLeases.set("lease-1", Date.now() - 1)
  state.recycleIdleRuntimes()
  await flush()
  assert.deepEqual(stopped, [managed.webSessionId])
  assert.equal(managed.runtimeLeases.has("lease-1"), false)
})

test("an unclaimed draft with an old activity time is retained by its lease", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const managed = runtime()
  const provisional = draft()
  provisional.runtime = managed
  state.runtimes.set(managed.webSessionId, managed)
  state.runtimeDrafts.set(provisional.draftId, provisional)
  const disposed: DraftFixture[] = []
  state.disposeRuntimeDraft = async (value) => {
    disposed.push(value)
  }

  state.recycleIdleRuntimes()
  await flush()

  assert.equal(state.runtimeDrafts.has(provisional.draftId), true)
  assert.deepEqual(disposed, [])
  assert.equal(provisional.leaseExpiries.has("lease-1"), true)
})

test("an expired abandoned draft is removed and disposed exactly once", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const provisional = draft(
    { leaseExpiries: new Map([["lease-1", Date.now() - 1]]) },
    { lastActivityAt: Date.now() - 24 * 60 * 60_000 }
  )
  state.runtimeDrafts.set(provisional.draftId, provisional)
  const disposed: DraftFixture[] = []
  state.disposeRuntimeDraft = async (value) => {
    disposed.push(value)
  }

  state.recycleIdleRuntimes()
  await flush()
  state.recycleIdleRuntimes()
  await flush()

  assert.equal(state.runtimeDrafts.has(provisional.draftId), false)
  assert.deepEqual(disposed, [provisional])
})

test("a pending claim is not crash-reaped or deleted while it settles", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = internals(supervisor)
  const pendingClaim = new Promise<RuntimeDraftClaimResult>(() => undefined)
  const provisional = draft(
    {
      leaseExpiries: new Map(),
      claimPromise: pendingClaim,
    },
    { cleaned: true }
  )
  state.runtimeDrafts.set(provisional.draftId, provisional)
  state.runtimes.set(provisional.runtime.webSessionId, provisional.runtime)
  const disposed: DraftFixture[] = []
  state.disposeRuntimeDraft = async (value) => {
    disposed.push(value)
  }

  state.recycleIdleRuntimes()
  await flush()

  assert.equal(state.runtimeDrafts.has(provisional.draftId), true)
  assert.deepEqual(disposed, [])
  assert.equal(provisional.runtime.cleaned, true)
})

test("failed draft claims reject identical retries instead of becoming successes", async () => {
  for (const code of ["ModelUnavailable", "RuntimeDraftClaimUncertain"]) {
    const supervisor = new RuntimeSupervisor(new EventHub())
    const state = internals(supervisor)
    const input = claimInput()
    const provisional = draft({
      claimFingerprint: claimFingerprint(input),
      claimFailure: { code, message: `${code} is permanent for this draft.` },
    })
    state.runtimeDrafts.set(provisional.draftId, provisional)
    let claimCalls = 0
    state.completeRuntimeDraftClaim = async () => {
      claimCalls += 1
      return {} as RuntimeDraftClaimResult
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(
        supervisor.claimRuntimeDraft(input),
        (error: unknown) => runtimeRequestCode(error) === code
      )
    }
    assert.equal(claimCalls, 0)
    assert.equal(provisional.claimResult, null)
  }
})
