import assert from "node:assert/strict"
import test from "node:test"

import {
  type WorkerAdapterContext,
  type WorkerSessionApi,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

function context() {
  const calls: unknown[] = []
  let opened: unknown
  let updated: unknown
  let nextResult:
    | {
        content: { type: string; text: string }[]
        details: Record<string, unknown>
      }
    | undefined
  const value = {
    target: {
      owner: {
        extensionPath: "/pi-intercom/index.ts",
        resolvedPath: "/pi-intercom/index.ts",
        sourceInfo: {
          source: "pi-intercom",
          scope: "user",
          origin: "package",
        },
      },
      commands: new Set(["intercom"]),
      tools: new Set(["intercom"]),
      messageRenderers: new Set(["intercom_message"]),
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
      if (nextResult && (params as { action: string }).action !== "list") {
        const result = nextResult
        nextResult = undefined
        return result
      }
      return {
        content: [
          {
            type: "text",
            text:
              (params as { action: string }).action === "list"
                ? "Current session: web"
                : "Message sent",
          },
        ],
        details: {},
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
  return {
    value,
    calls,
    opened: () => opened,
    updated: () => updated,
    result: (result: {
      content: { type: string; text: string }[]
      details: Record<string, unknown>
    }) => {
      nextResult = result
    },
  }
}

test("opens the native intercom dialog from the target tool", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("intercom.open")
  assert.ok(adapter)
  const runtime = context()
  const result = await adapter.handle(
    {
      invocation: {
        owner: runtime.value.target.owner,
        operation: { type: "command", name: "intercom" },
      },
      args: "prefilled",
    },
    runtime.value
  )
  assert.deepEqual(result, { handled: true })
  assert.deepEqual(runtime.calls, [{ action: "list" }])
  assert.deepEqual(runtime.opened(), {
    viewId: "intercom.dialog",
    placement: "session.dialog",
    blocking: true,
    title: "Intercom",
    state: { peers: "Current session: web", draft: "prefilled" },
  })
})

test("delegates intercom actions and refreshes peer state", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const action = registrations.actions.get("intercom.execute")
  assert.ok(action)
  const runtime = context()
  const state = await action.handle(
    {
      instanceId: "view",
      input: { action: "send", to: "peer", message: "hello" },
    },
    runtime.value
  )
  assert.deepEqual(runtime.calls, [
    { action: "send", to: "peer", message: "hello" },
    { action: "list" },
  ])
  assert.deepEqual(state, {
    peers: "Current session: web",
    output: "Message sent",
  })
  assert.deepEqual(runtime.updated(), state)
})

test("forwards replyTo independently and reports undelivered actions", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const action = registrations.actions.get("intercom.execute")
  assert.ok(action)
  const runtime = context()
  runtime.result({
    content: [{ type: "text", text: "Reply was not delivered" }],
    details: { delivered: false },
  })

  const state = await action.handle(
    {
      instanceId: "view",
      input: {
        action: "reply",
        to: "peer",
        message: "hello",
        replyTo: "ask-1",
      },
    },
    runtime.value
  )

  assert.deepEqual(runtime.calls, [
    {
      action: "reply",
      to: "peer",
      message: "hello",
      replyTo: "ask-1",
    },
    { action: "list" },
  ])
  assert.deepEqual(state, {
    peers: "Current session: web",
    error: "Reply was not delivered",
  })
})
