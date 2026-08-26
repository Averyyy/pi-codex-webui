import assert from "node:assert/strict"
import test from "node:test"

import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

test("renders the current pi-mermaid message payload", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const renderer = registrations.renderers.get("mermaid.render")
  assert.ok(renderer)
  const view = renderer.render(
    {
      invocation: {
        owner: {
          extensionPath: "/pi-mermaid/index.ts",
          resolvedPath: "/pi-mermaid/index.ts",
          sourceInfo: {
            source: "pi-mermaid",
            scope: "user",
            origin: "package",
          },
        },
        operation: { type: "message.render", customType: "pi-mermaid" },
      },
      payload: {
        message: {
          customType: "pi-mermaid",
          details: {
            source: "graph TD\n  A --> B",
            issues: [{ severity: "warning", message: "Parser unavailable" }],
          },
        },
      },
    },
    {} as never
  )
  assert.equal(view?.placement, "conversation.after")
  assert.deepEqual(view?.state, {
    source: "graph TD\n  A --> B",
    issues: [{ severity: "warning", message: "Parser unavailable" }],
  })
})
