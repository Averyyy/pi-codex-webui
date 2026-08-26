import assert from "node:assert/strict"
import test from "node:test"

import type {
  OpenViewInput,
  WorkerAdapterContext,
  WorkerCommandRequest,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

function fixture(viewResult: unknown) {
  let opened: OpenViewInput | undefined
  const context = {
    target: {
      owner: {
        extensionPath: "/package/extensions/resource-center/index.ts",
        resolvedPath: "/package/extensions/resource-center/index.ts",
        sourceInfo: {
          source: "pi-resource-center",
          scope: "user",
          origin: "package",
        },
        packageName: "pi-resource-center",
        packageVersion: "0.3.0",
      },
      commands: new Set(["resource"]),
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
    openView: async (view: OpenViewInput) => {
      opened = view
      return viewResult
    },
    updateView: () => {},
    closeView: () => {},
    invokeTargetTool: async () => {
      throw new Error("not used")
    },
    emitTargetEvent: () => {},
  } satisfies WorkerAdapterContext
  const request = (args = "") =>
    ({
      invocation: {
        owner: context.target.owner,
        operation: { type: "command", name: "resource" },
      },
      args,
    }) satisfies WorkerCommandRequest
  return { context, request, opened: () => opened }
}

test("opens a category picker and delegates the selected category", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("resource-center.open")
  assert.ok(adapter)
  const { context, request, opened } = fixture({ commandArgs: "extensions" })
  assert.deepEqual(await adapter.handle(request(), context), {
    handled: false,
    args: "extensions",
  })
  assert.equal(opened()?.viewId, "resource-center.browser")
  assert.deepEqual(await adapter.handle(request("sync"), context), {
    handled: false,
  })
})

test("does not run the original resource command after cancellation", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("resource-center.open")
  assert.ok(adapter)
  const { context, request } = fixture({ cancelled: true })
  assert.deepEqual(await adapter.handle(request(), context), { handled: true })
})
