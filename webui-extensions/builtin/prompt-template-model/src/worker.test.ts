import assert from "node:assert/strict"
import test from "node:test"

import type {
  ExtensionOwner,
  RendererAdapterRequest,
  WorkerAdapterContext,
} from "@pi-web-codex/extension-sdk"
import {
  loadClientExtensionForTest,
  loadWorkerExtensionForTest,
} from "@pi-web-codex/extension-sdk/testing"

import initializeClient from "./client.js"
import initialize from "./worker.js"

const owner: ExtensionOwner = {
  extensionPath: "/pi-prompt-template-model/index.ts",
  resolvedPath: "/pi-prompt-template-model/index.ts",
  sourceInfo: {
    source: "pi-prompt-template-model",
    scope: "user",
    origin: "package",
  },
  packageName: "pi-prompt-template-model",
  packageVersion: "0.12.1",
}

const messageTypes = [
  "skill-loaded",
  "prompt-template-subagent",
  "prompt-template-deterministic",
  "prompt-template-deterministic-complete",
]

function fixture() {
  return {
    target: {
      owner,
      commands: new Set(["chain-prompts", "prompt-tool"]),
      tools: new Set(["run-prompt"]),
      messageRenderers: new Set(messageTypes),
      entryRenderers: new Set<string>(),
    },
    session: {
      cwd: "/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    },
    signal: new AbortController().signal,
    openView: async () => "view",
    updateView: () => {},
    closeView: () => {},
    invokeTargetTool: async () => ({ content: [] }),
    emitTargetEvent: () => {},
  } satisfies WorkerAdapterContext
}

function request(customType: string, message: unknown): RendererAdapterRequest {
  return {
    invocation: {
      owner,
      operation: { type: "message.render", customType },
    },
    payload: { message, options: { expanded: false } },
  }
}

test("registers all prompt-template message and status adapters", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  assert.deepEqual(
    [...registrations.renderers.keys()],
    [
      "prompt-template.skill-loaded",
      "prompt-template.subagent",
      "prompt-template.deterministic",
      "prompt-template.deterministic-complete",
      "prompt-template.status.subagent",
      "prompt-template.status.loop",
      "prompt-template.status.chain",
    ]
  )
  const context = fixture()
  const skill = registrations.renderers.get("prompt-template.skill-loaded")
  assert.ok(skill)
  assert.deepEqual(skill.probe?.(context.target), { compatible: true })
  assert.deepEqual(
    skill.probe?.({
      ...context.target,
      messageRenderers: new Set<string>(),
    }),
    {
      compatible: false,
      reason: "Missing skill-loaded message renderer.",
    }
  )
})

test("registers the message-card and live-status client views", async () => {
  const registrations = await loadClientExtensionForTest(initializeClient)
  assert.deepEqual(
    [...registrations.views.keys()],
    ["prompt-template.message", "prompt-template.status"]
  )
})

test("normalizes each custom message into a native conversation card", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const context = fixture()

  const skill = registrations.renderers.get("prompt-template.skill-loaded")
  assert.ok(skill)
  assert.deepEqual(
    skill.render(
      request("skill-loaded", {
        details: {
          skillName: "review",
          skillPath: "/skills/review/SKILL.md",
          skillContent: "# Review\nCheck the diff.",
        },
      }),
      context
    ),
    {
      viewId: "prompt-template.message",
      placement: "conversation.after",
      state: {
        kind: "skill",
        skillName: "review",
        skillPath: "/skills/review/SKILL.md",
        skillContent: "# Review\nCheck the diff.",
      },
    }
  )

  const subagent = registrations.renderers.get("prompt-template.subagent")
  assert.ok(subagent)
  const subagentView = subagent.render(
    request("prompt-template-subagent", {
      content: "Implemented the change.",
      details: {
        agent: "worker",
        task: "Update the renderer",
        context: "fork",
        messages: [
          {
            role: "assistant",
            model: "test-model",
            usage: {
              input: 120,
              output: 80,
              cacheRead: 20,
              cacheWrite: 10,
              cost: { total: 0.004 },
            },
            content: [
              {
                type: "toolCall",
                name: "edit",
                arguments: { path: "/project/renderer.ts" },
              },
              { type: "text", text: "Implemented the change." },
            ],
          },
        ],
      },
    }),
    context
  )
  assert.equal(subagentView?.placement, "conversation.after")
  assert.deepEqual(subagentView?.state, {
    kind: "subagent",
    agent: "worker",
    context: "fork",
    task: "Update the renderer",
    text: "Implemented the change.",
    toolCalls: ["[edit: /project/renderer.ts]"],
    usage: {
      turns: 1,
      input: 120,
      output: 80,
      cacheRead: 20,
      cacheWrite: 10,
      cost: 0.004,
      model: "test-model",
    },
    parallelResults: [],
  })

  const deterministic = registrations.renderers.get(
    "prompt-template.deterministic"
  )
  assert.ok(deterministic)
  assert.deepEqual(
    deterministic.render(
      request("prompt-template-deterministic", {
        details: {
          execution: {
            kind: "command",
            command: "node",
            args: ["check.mjs"],
            shell: false,
          },
          cwd: "/project",
          nonInteractive: true,
          exitCode: 0,
          stdout: "ok",
          stdoutTotalChars: 2,
          stdoutTotalLines: 1,
          stdoutTruncated: false,
          stderr: "",
          stderrTotalChars: 0,
          stderrTotalLines: 0,
          stderrTruncated: false,
          durationMs: 25,
          timedOut: false,
        },
      }),
      context
    )?.state,
    {
      kind: "deterministic",
      command: "node check.mjs",
      cwd: "/project",
      nonInteractive: true,
      exitCode: 0,
      stdout: {
        text: "ok",
        totalChars: 2,
        totalLines: 1,
        truncated: false,
      },
      stderr: {
        text: "",
        totalChars: 0,
        totalLines: 0,
        truncated: false,
      },
      durationMs: 25,
      timedOut: false,
    }
  )

  const completion = registrations.renderers.get(
    "prompt-template.deterministic-complete"
  )
  assert.ok(completion)
  assert.deepEqual(
    completion.render(
      request("prompt-template-deterministic-complete", {
        details: {
          promptName: "verify",
          exitCode: 0,
          timedOut: false,
          status: "succeeded",
        },
      }),
      context
    )?.state,
    {
      kind: "deterministic-complete",
      promptName: "verify",
      exitCode: 0,
      timedOut: false,
      status: "succeeded",
    }
  )
  assert.equal(skill.render(request("skill-loaded", {}), context), undefined)
})

test("renders and clears all three live statuses", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const context = fixture()
  const cases = [
    ["prompt-template.status.subagent", "prompt-subagent", "Subagent"],
    ["prompt-template.status.loop", "prompt-loop", "Prompt loop"],
    ["prompt-template.status.chain", "prompt-chain", "Prompt chain"],
  ] as const

  for (const [handler, key, label] of cases) {
    const renderer = registrations.renderers.get(handler)
    assert.ok(renderer)
    const invocation = {
      owner,
      operation: { type: "status.render" as const, key },
    }
    assert.deepEqual(
      renderer.render(
        {
          invocation,
          payload: { statusText: "\u001b[33mstep 1/2\u001b[39m" },
        },
        context
      ),
      {
        viewId: "prompt-template.status",
        placement: "composer.above",
        state: { key, label, text: "step 1/2" },
      }
    )
    assert.equal(
      renderer.render(
        { invocation, payload: { statusText: undefined } },
        context
      ),
      undefined
    )
  }
})
