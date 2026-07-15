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
        extensionPath: "/package/index.ts",
        resolvedPath: "/package/index.ts",
        sourceInfo: {
          source: "pi-web-access",
          scope: "user",
          origin: "package",
        },
        packageName: "pi-web-access",
        packageVersion: "0.13.0",
      },
      commands: new Set(["websearch", "curator"]),
      tools: new Set(["web_search", "fetch_content", "get_search_content"]),
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
  } satisfies WorkerAdapterContext
  const request = (name: string, args = "") =>
    ({
      invocation: {
        owner: context.target.owner,
        operation: { type: "command", name },
      },
      args,
    }) satisfies WorkerCommandRequest
  return { context, request, opened: () => opened }
}

test("empty websearch opens the native query dialog then calls the original command", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("web-access.open-search")
  assert.ok(adapter)
  const { context, request, opened } = fixture({
    queries: ["Next.js 16", "React 19"],
  })
  assert.deepEqual(await adapter.handle(request("websearch"), context), {
    handled: false,
    args: "Next.js 16,React 19",
  })
  assert.equal(opened()?.viewId, "web-access.search")
  assert.deepEqual(
    await adapter.handle(request("websearch", "existing query"), context),
    { handled: false }
  )

  const empty = fixture({ queries: [] })
  await assert.rejects(async () =>
    adapter.handle(empty.request("websearch"), empty.context)
  )
})

test("curator workflow selection is delegated to pi-web-access", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("web-access.configure-curator")
  assert.ok(adapter)
  const { context, request, opened } = fixture({ workflow: "auto-summary" })
  assert.deepEqual(await adapter.handle(request("curator"), context), {
    handled: false,
    args: "auto-summary",
  })
  assert.equal(opened()?.viewId, "web-access.workflow")
})
