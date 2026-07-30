import assert from "node:assert/strict"
import test from "node:test"

import {
  type WorkerAdapterContext,
  type WorkerSessionApi,
  type WorkerToolExecutionRequest,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

const QUESTIONS = {
  questions: [
    {
      question: "Which implementation?",
      header: "Approach",
      options: [
        {
          label: "Native",
          description: "Use the native implementation.",
          preview: "const mode = 'native'",
        },
        {
          label: "Portable",
          description: "Use the portable implementation.",
        },
      ],
    },
  ],
}

function runtime(dialog: () => Promise<unknown>) {
  const events: Array<{ name: string; payload: unknown }> = []
  let opened: unknown
  const owner = {
    extensionPath: "/rpiv-ask-user-question/index.ts",
    resolvedPath: "/rpiv-ask-user-question/index.ts",
    sourceInfo: {
      source: "@juicesharp/rpiv-ask-user-question",
      scope: "user" as const,
      origin: "package" as const,
    },
    packageName: "@juicesharp/rpiv-ask-user-question",
    packageVersion: "2.2.0",
  }
  const value = {
    target: {
      owner,
      commands: new Set<string>(),
      tools: new Set(["ask_user_question"]),
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
      operation: { type: "tool.execute", name: "ask_user_question" },
    },
    toolCallId: "tool-call",
    params: QUESTIONS,
    signal: new AbortController().signal,
  } satisfies WorkerToolExecutionRequest
  return { value, request, events, opened: () => opened }
}

test("takes over ask_user_question with one native dialog and exact events", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.toolExecutions.get("ask-user-question.execute")
  assert.ok(adapter)
  const current = runtime(async () => ({
    cancelled: false,
    responses: [
      {
        questionIndex: 0,
        kind: "option",
        optionIndex: 0,
        notes: "preferred",
      },
    ],
  }))

  const result = await adapter.execute(current.request, current.value)
  assert.deepEqual(current.opened(), {
    viewId: "ask-user-question.dialog",
    placement: "session.dialog",
    blocking: true,
    title: "回答问题",
    state: QUESTIONS,
  })
  assert.deepEqual(current.events, [
    {
      name: "rpiv:ask-user:prompt",
      payload: {
        questions: [
          {
            question: "Which implementation?",
            header: "Approach",
            multiSelect: false,
            options: [
              {
                label: "Native",
                description: "Use the native implementation.",
                hasPreview: true,
              },
              {
                label: "Portable",
                description: "Use the portable implementation.",
                hasPreview: false,
              },
            ],
          },
        ],
      },
    },
    { name: "rpiv:ask-user:blocked", payload: { active: true } },
    { name: "rpiv:ask-user:blocked", payload: { active: false } },
  ])
  assert.deepEqual(result, {
    handled: true,
    result: {
      content: [
        {
          type: "text",
          text:
            "User has answered your questions: " +
            '"Which implementation?"="Native". ' +
            "selected preview: const mode = 'native'. " +
            "user notes: preferred. " +
            "You can now continue with the user's answers in mind.",
        },
      ],
      details: {
        answers: [
          {
            questionIndex: 0,
            question: "Which implementation?",
            kind: "option",
            answer: "Native",
            notes: "preferred",
            preview: "const mode = 'native'",
          },
        ],
        cancelled: false,
      },
    },
  })
})

test("exposes client failure after restoring the blocked state", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.toolExecutions.get("ask-user-question.execute")
  assert.ok(adapter)
  const current = runtime(async () => {
    throw new Error("Adapter client disposed.")
  })

  await assert.rejects(
    async () => adapter.execute(current.request, current.value),
    /Adapter client disposed/
  )
  assert.deepEqual(current.events.slice(-2), [
    { name: "rpiv:ask-user:blocked", payload: { active: true } },
    { name: "rpiv:ask-user:blocked", payload: { active: false } },
  ])
})

test("returns the canonical decline only for an explicit dialog cancel", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.toolExecutions.get("ask-user-question.execute")
  assert.ok(adapter)
  const current = runtime(async () => ({ cancelled: true, responses: [] }))

  assert.deepEqual(await adapter.execute(current.request, current.value), {
    handled: true,
    result: {
      content: [{ type: "text", text: "User declined to answer questions" }],
      details: { answers: [], cancelled: true },
    },
  })
})

test("returns upstream validation details before opening the dialog", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.toolExecutions.get("ask-user-question.execute")
  assert.ok(adapter)
  const current = runtime(async () => {
    throw new Error("must not open")
  })
  current.request.params = {
    questions: [
      {
        question: "Question?",
        header: "Header",
        options: [
          { label: "Next", description: "Reserved." },
          { label: "Safe", description: "Safe." },
        ],
      },
    ],
  }

  assert.deepEqual(await adapter.execute(current.request, current.value), {
    handled: true,
    result: {
      content: [
        {
          type: "text",
          text:
            "Error: Option label is reserved " +
            "(Other, Type something., Next)",
        },
      ],
      details: {
        answers: [],
        cancelled: true,
        error: "reserved_label",
      },
    },
  })
  assert.equal(current.opened(), undefined)
  assert.deepEqual(current.events, [])
})
