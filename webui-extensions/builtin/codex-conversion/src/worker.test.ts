import assert from "node:assert/strict"
import test from "node:test"

import type {
  OpenViewInput,
  WorkerAdapterContext,
  WorkerCommandRequest,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

test("Codex quick settings hand the selected option to the original command", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("codex.quick-settings")
  assert.ok(adapter)
  let opened: OpenViewInput | undefined
  const context = {
    target: {
      owner: {
        extensionPath: "/package/dist/index.js",
        resolvedPath: "/package/dist/index.js",
        sourceInfo: {
          source: "@howaboua/pi-codex-conversion",
          scope: "user",
          origin: "package",
        },
        packageName: "@howaboua/pi-codex-conversion",
        packageVersion: "2.1.7",
      },
      commands: new Set(["codex"]),
      tools: new Set<string>(),
      messageRenderers: new Set<string>(),
      entryRenderers: new Set<string>(),
    },
    session: {
      cwd: "/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    },
    signal: new AbortController().signal,
    openView: async (view) => {
      opened = view
      return { command: "fast" }
    },
    updateView: () => {},
    closeView: () => {},
  } satisfies WorkerAdapterContext
  const request = {
    invocation: {
      owner: context.target.owner,
      operation: { type: "command", name: "codex" },
    },
    args: "",
  } satisfies WorkerCommandRequest

  assert.deepEqual(await adapter.handle(request, context), {
    handled: false,
    args: "fast",
  })
  assert.equal(opened?.viewId, "codex.quick-settings")
  assert.deepEqual(
    await adapter.handle({ ...request, args: "usage" }, context),
    { handled: false }
  )
})
