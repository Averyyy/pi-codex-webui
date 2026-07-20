import assert from "node:assert/strict"
import test from "node:test"

import type {
  ExtensionOwner,
  RendererAdapterRequest,
  WorkerAdapterContext,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

const owner: ExtensionOwner = {
  extensionPath: "/pi-goal/src/goal.ts",
  resolvedPath: "/pi-goal/src/goal.ts",
  sourceInfo: { source: "pi-goal", scope: "user", origin: "package" },
  packageName: "@narumitw/pi-goal",
  packageVersion: "0.20.0",
}

const goal = {
  id: "goal-1",
  text: "Ship the feature",
  status: "paused",
  startedAt: 1,
  updatedAt: 2,
  iteration: 3,
  tokensUsed: 4_000,
  timeUsedSeconds: 65,
}

function fixture() {
  const prompts: string[] = []
  const context = {
    target: {
      owner,
      commands: new Set(["goal"]),
      tools: new Set(["goal_complete", "goal_blocked"]),
      messageRenderers: new Set<string>(),
      entryRenderers: new Set<string>(),
    },
    session: {
      cwd: "/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
      latestCustomEntry: () => ({ goal }),
      command: async (name: string, args: string) => {
        prompts.push(`/${name} ${args}`)
      },
    },
    signal: new AbortController().signal,
    openView: async () => "view",
    updateView: () => {},
    closeView: () => {},
  } satisfies WorkerAdapterContext
  return { context, prompts }
}

test("goal status renders the persisted goal above the composer", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const renderer = registrations.renderers.get("goal.status")
  assert.ok(renderer)
  const { context } = fixture()
  const request: RendererAdapterRequest = {
    invocation: { owner, operation: { type: "status.render", key: "goal" } },
    payload: { statusText: "paused" },
  }
  const view = renderer.render(request, context)
  assert.equal(view?.viewId, "goal.card")
  assert.equal(view?.placement, "composer.above")
  assert.deepEqual(view?.state, { statusText: "paused", goal, queue: [] })
  assert.equal(renderer.render({ ...request, payload: {} }, context), undefined)
})

test("goal actions delegate to the original slash command", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const action = registrations.actions.get("goal.command")
  assert.ok(action)
  const { context, prompts } = fixture()
  await action.handle(
    {
      instanceId: "view",
      input: {
        command: "edit",
        objective: "Updated goal",
        tokenBudget: 20_000,
      },
    },
    context
  )
  await action.handle(
    { instanceId: "view", input: { command: "resume" } },
    context
  )
  assert.deepEqual(prompts, [
    "/goal edit --tokens 20000 Updated goal",
    "/goal resume",
  ])
})
