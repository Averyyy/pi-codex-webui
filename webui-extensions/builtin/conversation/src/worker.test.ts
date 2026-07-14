import assert from "node:assert/strict"
import test from "node:test"

import type {
  OpenViewInput,
  WorkerAdapterContext,
  WorkerCommandRequest,
  WorkerSessionInfo,
} from "@pi-web-codex/extension-sdk"
import { loadWorkerExtensionForTest } from "@pi-web-codex/extension-sdk/testing"

import initialize from "./worker.js"

test("conversation adapter uses Pi session metadata and switches only to a listed session", async () => {
  const registrations = await loadWorkerExtensionForTest(initialize)
  const adapter = registrations.commands.get("conversation.open")
  assert.ok(adapter)
  const current: WorkerSessionInfo = {
    sessionPath: "/sessions/current.jsonl",
    id: "current",
    cwd: "/project",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T01:00:00.000Z",
    messageCount: 4,
    firstMessage: "Current conversation",
  }
  const selected: WorkerSessionInfo = {
    sessionPath: "/sessions/selected.jsonl",
    id: "selected",
    cwd: "/project",
    name: "Selected conversation",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T01:00:00.000Z",
    messageCount: 8,
    firstMessage: "Ignored because the session has a name",
  }
  const sessions = [current, selected]
  let opened: OpenViewInput | undefined
  let switchedTo: string | undefined
  const context: WorkerAdapterContext = {
    target: {
      owner: {
        extensionPath: "/pi-target/index.js",
        resolvedPath: "/pi-target/index.js",
        sourceInfo: {
          source: "pi-codex-conversation",
          scope: "user",
          origin: "package",
        },
        packageName: "pi-codex-conversation",
        packageVersion: "1.5.1",
      },
      commands: new Set(["conversation"]),
      tools: new Set(),
      messageRenderers: new Set(),
      entryRenderers: new Set(),
    },
    session: {
      cwd: "/project",
      sessionFile: current.sessionPath,
      listSessions: async () => sessions,
      switchSession: async (sessionPath) => {
        switchedTo = sessionPath
        return { cancelled: false }
      },
    },
    signal: new AbortController().signal,
    openView: async (view) => {
      opened = view
      return { sessionPath: selected.sessionPath }
    },
    updateView: () => {},
    closeView: () => {},
  }
  const request = {
    invocation: {
      owner: context.target.owner,
      operation: { type: "command", name: "conversation" },
    },
    args: "",
  } satisfies WorkerCommandRequest

  assert.deepEqual(await adapter.handle(request, context), { handled: true })
  assert.equal(switchedTo, selected.sessionPath)
  assert.deepEqual(opened?.state, {
    currentSessionPath: current.sessionPath,
    conversations: [
      {
        sessionPath: current.sessionPath,
        name: current.firstMessage,
        updatedAt: current.updatedAt,
      },
      {
        sessionPath: selected.sessionPath,
        name: selected.name,
        updatedAt: selected.updatedAt,
      },
    ],
  })
})
