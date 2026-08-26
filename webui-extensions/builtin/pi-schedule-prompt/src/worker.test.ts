import assert from "node:assert/strict"
import test from "node:test"

import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

test("renders ordinary and subagent scheduled prompt messages", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const renderer = registrations.renderers.get("scheduled-prompt.render")
  assert.ok(renderer)
  const request = (details: Record<string, unknown>) => ({
    invocation: {
      owner: {
        extensionPath: "/pi-schedule-prompt/src/index.ts",
        resolvedPath: "/pi-schedule-prompt/src/index.ts",
        sourceInfo: {
          source: "pi-schedule-prompt",
          scope: "user" as const,
          origin: "package" as const,
        },
      },
      operation: {
        type: "message.render" as const,
        customType: "scheduled_prompt",
      },
    },
    payload: { message: { customType: "scheduled_prompt", details } },
  })

  assert.deepEqual(
    renderer.render(
      request({ jobName: "Check build", prompt: "Run tests" }),
      {} as never
    )?.state,
    { jobName: "Check build", prompt: "Run tests", mode: "prompt" }
  )
  const done = renderer.render(
    request({
      jobName: "Check build",
      prompt: "Run tests",
      mode: "subagent_done",
      model: "gpt-5",
      output: "Passed",
    }),
    {} as never
  )
  assert.equal(done?.placement, "conversation.after")
  assert.deepEqual(done?.state, {
    jobName: "Check build",
    prompt: "Run tests",
    mode: "subagent_done",
    model: "gpt-5",
    output: "Passed",
  })
})
