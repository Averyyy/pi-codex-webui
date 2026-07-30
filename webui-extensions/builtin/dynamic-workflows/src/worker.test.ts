import assert from "node:assert/strict"
import test from "node:test"

import {
  type WorkerAdapterContext,
  type WorkerSessionApi,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

const RUN = {
  runId: "run-1",
  workflowName: "Research",
  status: "running",
  phase: "fanout",
  counts: {
    total: 3,
    done: 1,
    running: 1,
    queued: 1,
    error: 0,
    skipped: 0,
  },
  activeLabels: ["search"],
  tokenTotal: 120,
}

function runtime(dialogResult: unknown = undefined) {
  const calls: unknown[] = []
  let opened: unknown
  let updated: unknown
  const value = {
    target: {
      owner: {
        extensionPath: "/dynamic/extensions/workflow.ts",
        resolvedPath: "/dynamic/extensions/workflow.ts",
        sourceInfo: {
          source: "@quintinshaw/pi-dynamic-workflows",
          scope: "user",
          origin: "package",
        },
      },
      commands: new Set(["workflows"]),
      tools: new Set(["workflow", "workflow_control"]),
      messageRenderers: new Set<string>(),
      entryRenderers: new Set<string>(),
    },
    session: {
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    } satisfies WorkerSessionApi,
    signal: new AbortController().signal,
    invokeTargetTool: async (_name: string, params: unknown) => {
      calls.push(params)
      const action = (params as { action: string }).action
      return action === "list"
        ? {
            content: [{ type: "text", text: "runs=1" }],
            details: { action: "list", result: "ok", runs: [RUN] },
          }
        : {
            content: [{ type: "text", text: `action=${action} result=ok` }],
            details: { action, result: `${action}d`, run: RUN },
          }
    },
    emitTargetEvent: () => {},
    openView: async (input: unknown) => {
      opened = input
      return dialogResult
    },
    updateView: (_id: string, state: unknown) => {
      updated = state
    },
    closeView: () => {},
  } satisfies WorkerAdapterContext
  return { value, calls, opened: () => opened, updated: () => updated }
}

test("opens workflow manager for the no-argument command", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("dynamic-workflows.open")
  assert.ok(adapter)
  const ctx = runtime()
  const result = await adapter.handle(
    {
      invocation: {
        owner: ctx.value.target.owner,
        operation: { type: "command", name: "workflows" },
      },
      args: "",
    },
    ctx.value
  )
  assert.deepEqual(result, { handled: true })
  assert.deepEqual(ctx.calls, [{ action: "list" }])
  assert.deepEqual(
    (ctx.opened() as { state: { runs: unknown[] } }).state.runs,
    [RUN]
  )
})

test("starts a workflow through the original command", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("dynamic-workflows.open")
  assert.ok(adapter)
  const ctx = runtime({ commandArgs: "run compare models" })
  const result = await adapter.handle(
    {
      invocation: {
        owner: ctx.value.target.owner,
        operation: { type: "command", name: "workflows" },
      },
      args: "",
    },
    ctx.value
  )
  assert.deepEqual(result, {
    handled: false,
    args: "run compare models",
  })
})

test("controls a run through workflow_control and refreshes", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const action = registrations.actions.get("dynamic-workflows.control")
  assert.ok(action)
  const ctx = runtime()
  const state = await action.handle(
    { instanceId: "view", input: { action: "pause", runId: "run-1" } },
    ctx.value
  )
  assert.deepEqual(ctx.calls, [
    { action: "pause", runId: "run-1" },
    { action: "list" },
  ])
  assert.deepEqual(ctx.updated(), state)
})
