import assert from "node:assert/strict"
import test from "node:test"
import type { AgentSettingsSnapshot } from "@workspace/runtime-protocol"
import { EventHub } from "./event-hub"
import { RuntimeSupervisor } from "./runtime-supervisor"

type SettingsRuntime = {
  webSessionId: string
  cwd: string
  status: string
  pendingSettingsRestart: boolean
  cleaned?: boolean
  snapshot?: {
    model: { provider: string; id: string }
    thinkingLevel: string
    activeTools: string[]
  }
}
type Internals = {
  runtimes: Map<string, SettingsRuntime>
  resourceRequest(message: { type: string }): Promise<unknown>
  restartConfiguredRuntime(runtime: SettingsRuntime): Promise<void>
  reloadConfiguredRuntimes(cwd: string, global: boolean): Promise<void>
  runtimeDrafts: Map<string, { runtime: SettingsRuntime }>
  refreshClaimedDraftSettings(draft: {
    runtime: SettingsRuntime
    leaseToken: string
  }): Promise<SettingsRuntime>
  stop(sessionId: string): Promise<void>
  cleanup(runtime: SettingsRuntime): Promise<void>
  activate(sessionId: string): Promise<SettingsRuntime>
  setModel(sessionId: string, provider: string, id: string): Promise<void>
  setThinkingLevel(sessionId: string, level: string): Promise<void>
}

test("saving agent settings applies idle runtimes after persistence and queues streaming runtimes", async (context) => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = supervisor as unknown as Internals
  context.after(() => state.runtimes.clear())
  const idle: SettingsRuntime = {
    webSessionId: "idle",
    cwd: "/project-a",
    status: "ready",
    pendingSettingsRestart: false,
  }
  const busy: SettingsRuntime = {
    webSessionId: "streaming",
    cwd: "/project-b",
    status: "busy",
    pendingSettingsRestart: false,
  }
  const starting: SettingsRuntime = {
    webSessionId: "starting",
    cwd: "/project-c",
    status: "starting",
    pendingSettingsRestart: false,
  }
  state.runtimes.set(idle.webSessionId, idle)
  state.runtimes.set(busy.webSessionId, busy)
  state.runtimes.set(starting.webSessionId, starting)
  const events: string[] = []
  const settings: AgentSettingsSnapshot = {
    global: { cacheWarming: "idle" },
    defaults: {},
    effective: { cacheWarming: "idle" },
    project: {},
    projectTrusted: false,
  }
  state.resourceRequest = async (message) => {
    assert.equal(message.type, "agent-settings.set")
    events.push("persist")
    return settings
  }
  state.restartConfiguredRuntime = async (runtime) => {
    events.push(`restart:${runtime.webSessionId}`)
  }
  const result = await supervisor.setAgentSettings(
    { cwd: "/project-a", runtimeKind: "pi", runtimeProfileId: "pi" },
    { cacheWarming: "idle" },
    {}
  )
  assert.deepEqual(result, settings)
  assert.deepEqual(events, ["persist", "restart:idle"])
  assert.equal(busy.pendingSettingsRestart, true)
  assert.equal(starting.pendingSettingsRestart, true)
})

test("agent settings conflicts do not restart current runtimes", async () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = supervisor as unknown as Internals
  let reloaded = false
  state.resourceRequest = async () => {
    throw new Error("Agent settings changed.")
  }
  state.reloadConfiguredRuntimes = async () => {
    reloaded = true
  }
  await assert.rejects(
    supervisor.setAgentSettings(
      { cwd: "/project", runtimeKind: "pi", runtimeProfileId: "pi" },
      { cacheWarming: "idle" },
      {}
    ),
    /Agent settings changed/
  )
  assert.equal(reloaded, false)
})

test("unclaimed drafts defer settings changes until promotion and restore the selected model and thinking", async (context) => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const state = supervisor as unknown as Internals
  context.after(() => {
    state.runtimes.clear()
    state.runtimeDrafts.clear()
  })
  const previous: SettingsRuntime = {
    webSessionId: "promoted-session",
    cwd: "/project",
    status: "ready",
    cleaned: false,
    pendingSettingsRestart: false,
    snapshot: {
      model: { provider: "fixture", id: "chosen" },
      thinkingLevel: "medium",
      activeTools: ["read", "bash"],
    },
  }
  const draft = { runtime: previous, leaseToken: "original-lease" }
  state.runtimeDrafts.set("draft", draft)
  const operations: string[] = []
  state.stop = async (sessionId) => {
    operations.push(`stop:${sessionId}`)
  }
  state.cleanup = async (runtime) => {
    runtime.cleaned = true
    operations.push("cleanup")
  }
  await state.restartConfiguredRuntime(previous)
  assert.equal(previous.pendingSettingsRestart, true)
  assert.equal(operations.length, 0)
  assert.equal(draft.runtime, previous)

  const refreshed: SettingsRuntime = {
    ...previous,
    cleaned: false,
    pendingSettingsRestart: false,
    snapshot: {
      model: { provider: "fixture", id: "new-default" },
      thinkingLevel: "off",
      activeTools: ["read"],
    },
  }
  state.activate = async (sessionId) => {
    operations.push(`activate:${sessionId}`)
    return refreshed
  }
  state.setModel = async (sessionId, provider, id) => {
    operations.push(`model:${sessionId}:${provider}/${id}`)
    refreshed.snapshot!.model = { provider, id }
  }
  state.setThinkingLevel = async (sessionId, level) => {
    operations.push(`thinking:${sessionId}:${level}`)
    refreshed.snapshot!.thinkingLevel = level
  }
  const result = await state.refreshClaimedDraftSettings(draft)
  assert.deepEqual(operations, [
    "stop:promoted-session",
    "cleanup",
    "activate:promoted-session",
    "model:promoted-session:fixture/chosen",
    "thinking:promoted-session:medium",
  ])
  assert.equal(result, refreshed)
  assert.equal(draft.runtime, refreshed)
  assert.equal(draft.leaseToken, "original-lease")
  assert.equal(previous.cleaned, true)
  assert.deepEqual(result.snapshot, {
    model: { provider: "fixture", id: "chosen" },
    thinkingLevel: "medium",
    activeTools: ["read"],
  })
  await state.refreshClaimedDraftSettings(draft)
  assert.equal(operations.length, 5)
})
