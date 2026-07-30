import assert from "node:assert/strict"
import test from "node:test"

import {
  type WorkerAdapterContext,
  type WorkerSessionApi,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

const TASK = {
  id: 1,
  subject: "Inspect extension",
  status: "pending",
}

function runtime() {
  const calls: unknown[] = []
  let opened: unknown
  let updated: unknown
  const value = {
    target: {
      owner: {
        extensionPath: "/rpiv-todo/index.ts",
        resolvedPath: "/rpiv-todo/index.ts",
        sourceInfo: {
          source: "@juicesharp/rpiv-todo",
          scope: "user",
          origin: "package",
        },
      },
      commands: new Set(["todos"]),
      tools: new Set(["todo"]),
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
      return {
        content: [{ type: "text", text: "ok" }],
        details: {
          action: (params as { action: string }).action,
          params,
          tasks: [TASK],
          nextId: 2,
        },
      }
    },
    emitTargetEvent: () => {},
    openView: async (input: unknown) => {
      opened = input
    },
    updateView: (_id: string, state: unknown) => {
      updated = state
    },
    closeView: () => {},
  } satisfies WorkerAdapterContext
  return { value, calls, opened: () => opened, updated: () => updated }
}

test("opens todos with state from the target tool", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("rpiv-todo.open")
  assert.ok(adapter)
  const ctx = runtime()
  const result = await adapter.handle(
    {
      invocation: {
        owner: ctx.value.target.owner,
        operation: { type: "command", name: "todos" },
      },
      args: "",
    },
    ctx.value
  )
  assert.deepEqual(result, { handled: true })
  assert.deepEqual(ctx.calls, [{ action: "list" }])
  assert.deepEqual(
    (ctx.opened() as { state: { tasks: unknown[] } }).state.tasks,
    [TASK]
  )
})

test("refreshes todos without creating an unpersisted mutation", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const action = registrations.actions.get("rpiv-todo.refresh")
  assert.ok(action)
  const ctx = runtime()
  const state = await action.handle({ instanceId: "view" }, ctx.value)
  assert.deepEqual(ctx.calls, [{ action: "list" }])
  assert.deepEqual(ctx.updated(), state)
})
