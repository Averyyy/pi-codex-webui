import assert from "node:assert/strict"
import test from "node:test"

import {
  type WorkerAdapterContext,
  type WorkerSessionApi,
  type WorkerToolExecutionRequest,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

const PARAMS = {
  question: "Which implementation?",
  context: "The native path removes the terminal fallback.",
  options: [
    { title: "Native", description: "Use the browser interface." },
    { title: "Terminal", description: "Keep the TUI." },
  ],
  allowMultiple: false,
  allowFreeform: true,
  allowComment: true,
}

function runtime(dialog: () => Promise<unknown>) {
  const events: Array<{ name: string; payload: unknown }> = []
  let opened: unknown
  const owner = {
    extensionPath: "/pi-ask-user/index.ts",
    resolvedPath: "/pi-ask-user/index.ts",
    sourceInfo: {
      source: "pi-ask-user",
      scope: "user" as const,
      origin: "package" as const,
    },
    packageName: "pi-ask-user",
    packageVersion: "0.14.0",
  }
  const value = {
    target: {
      owner,
      commands: new Set<string>(),
      tools: new Set(["ask_user"]),
      messageRenderers: new Set<string>(),
      entryRenderers: new Set<string>(),
    },
    session: {
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    } satisfies WorkerSessionApi,
    signal: new AbortController().signal,
    openView: async (input: unknown) => {
      opened = input
      return dialog()
    },
    updateView: () => {},
    closeView: () => {},
    invokeTargetTool: async () => ({ content: [] }),
    emitTargetEvent: (name: string, payload: unknown) => {
      events.push({ name, payload })
    },
  } satisfies WorkerAdapterContext
  const request = {
    invocation: {
      owner,
      operation: { type: "tool.execute", name: "ask_user" },
    },
    toolCallId: "tool-call",
    params: PARAMS,
    signal: new AbortController().signal,
  } satisfies WorkerToolExecutionRequest
  return { value, request, events, opened: () => opened }
}

test("takes over ask_user with a native dialog and preserves its result", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.toolExecutions.get("ask-user.execute")
  assert.ok(adapter)
  const current = runtime(async () => ({
    cancelled: false,
    response: {
      kind: "selection",
      selections: ["Native"],
      comment: "Use this path.",
    },
  }))

  const result = await adapter.execute(current.request, current.value)
  assert.deepEqual(current.opened(), {
    viewId: "ask-user.dialog",
    placement: "session.dialog",
    blocking: true,
    title: "需要你的选择",
    state: { ...PARAMS, options: PARAMS.options },
  })
  assert.deepEqual(result, {
    handled: true,
    result: {
      content: [
        { type: "text", text: "User answered: Native — Use this path." },
      ],
      details: {
        question: PARAMS.question,
        context: PARAMS.context,
        options: PARAMS.options,
        response: {
          kind: "selection",
          selections: ["Native"],
          comment: "Use this path.",
        },
        cancelled: false,
      },
    },
  })
  assert.deepEqual(current.events, [
    {
      name: "herdr:blocked",
      payload: { active: true, label: "Waiting for user response" },
    },
    {
      name: "ask:answered",
      payload: {
        question: PARAMS.question,
        context: PARAMS.context,
        response: {
          kind: "selection",
          selections: ["Native"],
          comment: "Use this path.",
        },
      },
    },
    { name: "herdr:blocked", payload: { active: false } },
  ])
})

test("restores blocked state and returns the canonical cancellation", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.toolExecutions.get("ask-user.execute")
  assert.ok(adapter)
  const current = runtime(async () => ({ cancelled: true }))

  const result = await adapter.execute(current.request, current.value)
  assert.equal(result.handled, true)
  if (!result.handled) return
  assert.equal(
    (result.result.content[0] as { text?: string } | undefined)?.text,
    "User cancelled the question"
  )
  assert.equal(
    (result.result.details as { cancelled: boolean }).cancelled,
    true
  )
  assert.deepEqual(current.events.slice(-2), [
    {
      name: "ask:cancelled",
      payload: {
        question: PARAMS.question,
        context: PARAMS.context,
        options: PARAMS.options,
      },
    },
    { name: "herdr:blocked", payload: { active: false } },
  ])
})

test("rejects a response that selects an unknown option", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.toolExecutions.get("ask-user.execute")
  assert.ok(adapter)
  const current = runtime(async () => ({
    cancelled: false,
    response: { kind: "selection", selections: ["Unknown"] },
  }))

  await assert.rejects(async () => {
    await adapter.execute(current.request, current.value)
  }, /Invalid ask_user selected option/)
  assert.deepEqual(current.events.at(-1), {
    name: "herdr:blocked",
    payload: { active: false },
  })
})
