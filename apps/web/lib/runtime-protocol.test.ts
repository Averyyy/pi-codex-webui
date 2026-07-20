import assert from "node:assert/strict"
import test from "node:test"

import {
  extensionUIRequestSchema,
  extensionUIResponseSchema,
  hostToWorkerMessageSchema,
  promptAcceptedSchema,
  queueUpdatedEventSchema,
  resourceCatalogSchema,
  runtimeStatusSchema,
  subagentsSnapshotSchema,
  tuiSurfaceActionSchema,
  tuiSurfaceSnapshotSchema,
  workerToHostMessageSchema,
} from "@workspace/runtime-protocol"

import { runtimeErrorResponse } from "./runtime-api"
import { isRuntimeRequestError } from "./runtime-error"
import { hasAvailableSelectedModel } from "./runtime-supervisor"

test("runtime status accepts only supervisor states", () => {
  assert.equal(runtimeStatusSchema.parse("busy"), "busy")
  assert.equal(runtimeStatusSchema.safeParse("running").success, false)
})

test("IPC schemas reject uncorrelated requests and responses", () => {
  assert.equal(
    hostToWorkerMessageSchema.safeParse({
      type: "session.abort",
      sessionId: "session-a",
    }).success,
    false
  )
  assert.equal(
    workerToHostMessageSchema.safeParse({
      type: "runtime.response",
      success: true,
    }).success,
    false
  )
})

test("runtime initialization declares resume, new, or duplicate explicitly", () => {
  const base = {
    type: "runtime.initialize",
    requestId: "request-1",
    payload: {
      webSessionId: "web-1",
      runtimeProfileId: "pi-client-default",
      cwd: "/tmp/project",
      agentDir: "/tmp/agent",
      mcpTools: [],
      webuiAdapters: [],
    },
  }
  assert.equal(
    hostToWorkerMessageSchema.parse({
      ...base,
      payload: { ...base.payload, target: { mode: "new" } },
    }).type,
    "runtime.initialize"
  )
  assert.equal(
    hostToWorkerMessageSchema.safeParse({
      ...base,
      payload: { ...base.payload, nativeSessionFile: "/tmp/session.jsonl" },
    }).success,
    false
  )
})

test("subagent snapshots and stop requests remain protocol validated", () => {
  assert.equal(
    subagentsSnapshotSchema.parse({
      version: 1,
      revision: 2,
      available: true,
      agents: [],
    }).revision,
    2
  )
  assert.equal(
    hostToWorkerMessageSchema.parse({
      type: "subagents.stop",
      requestId: "request-1",
      sessionId: "session-1",
      payload: { agentId: "agent-1" },
    }).type,
    "subagents.stop"
  )
})

test("WebUI view and client messages remain protocol validated", () => {
  const view = {
    version: 1,
    extensionId: "conversation",
    adapterKey: "builtin:conversation#conversation",
    viewId: "conversation.browser",
    instanceId: "01234567-89ab-4def-8123-456789abcdef",
    placement: "session.overlay",
    revision: 0,
    state: { conversations: [] },
    blocking: true,
  }
  assert.equal(
    workerToHostMessageSchema.parse({
      type: "webui.view.event",
      sessionId: "session-a",
      payload: { version: 1, kind: "open", view },
    }).type,
    "webui.view.event"
  )
  assert.equal(
    hostToWorkerMessageSchema.safeParse({
      type: "webui.client.status",
      requestId: "request-a",
      sessionId: "session-a",
      payload: {
        extensionId: "conversation",
        instanceId: view.instanceId,
        status: "unknown",
      },
    }).success,
    false
  )
})

test("prompt acceptance records whether Pi queued the message", () => {
  assert.deepEqual(
    promptAcceptedSchema.parse({ accepted: true, queued: true }),
    {
      accepted: true,
      queued: true,
    }
  )
  assert.equal(
    promptAcceptedSchema.safeParse({ accepted: true }).success,
    false
  )
})

test("prompt queue messages preserve identity, order, and mode", () => {
  const first = {
    id: "103bddb6-4b6e-45c8-a7ac-21587073147f",
    text: "first",
    mode: "followUp" as const,
  }
  const second = {
    id: "7473e73d-3d53-4dc4-9396-a69449963c96",
    text: "second",
    mode: "steer" as const,
  }
  assert.deepEqual(
    queueUpdatedEventSchema.parse({
      steering: ["second"],
      followUp: ["first"],
      items: [first, second],
    }).items,
    [first, second]
  )
  assert.equal(
    hostToWorkerMessageSchema.safeParse({
      type: "session.queue.replace",
      requestId: "request-1",
      sessionId: "session-1",
      payload: { expected: [first, second], next: [first, second] },
    }).success,
    true
  )
})

test("runtime errors survive server bundle boundaries", async () => {
  const error = {
    isPiWebCodexRuntimeRequestError: true,
    code: "RuntimeNotActive",
    message: "The Pi runtime is not active.",
  }
  assert.equal(isRuntimeRequestError(error), true)

  const response = runtimeErrorResponse(error)
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), {
    error: "The Pi runtime is not active.",
    code: "RuntimeNotActive",
  })
})

test("a selected runtime model must still be available", () => {
  const model = {
    provider: "provider-a",
    id: "model-a",
    name: "Model A",
    reasoning: false,
    input: ["text" as const],
    contextWindow: 128_000,
    maxTokens: 8_192,
  }
  assert.equal(
    hasAvailableSelectedModel({ model, availableModels: [model] }),
    true
  )
  assert.equal(hasAvailableSelectedModel({ model, availableModels: [] }), false)
})

test("extension UI protocol distinguishes dialogs from notifications", () => {
  assert.deepEqual(
    extensionUIRequestSchema.parse({
      method: "select",
      title: "Choose",
      options: ["one", "two"],
    }),
    { method: "select", title: "Choose", options: ["one", "two"] }
  )
  assert.deepEqual(extensionUIResponseSchema.parse({ confirmed: false }), {
    confirmed: false,
  })
  assert.equal(
    extensionUIRequestSchema.safeParse({
      method: "setWidget",
      widgetKey: "status",
      widgetLines: "not-an-array",
    }).success,
    false
  )
  assert.deepEqual(
    workerToHostMessageSchema.parse({
      type: "extension.ui.closed",
      requestId: "request-a",
      sessionId: "session-a",
    }),
    {
      type: "extension.ui.closed",
      requestId: "request-a",
      sessionId: "session-a",
    }
  )
})

test("TUI surface protocol bounds snapshots and ordered actions", () => {
  const snapshot = tuiSurfaceSnapshotSchema.parse({
    version: 1,
    surfaceId: "90c47420-c2cd-4280-9524-6e7dc3e6096e",
    mode: "inline",
    placement: "aboveEditor",
    progress: false,
    columns: 120,
    rows: 32,
    revision: 4,
    data: "\u001b[2Jready",
  })
  assert.equal(snapshot.columns, 120)
  assert.deepEqual(
    tuiSurfaceActionSchema.parse({ version: 1, action: "input", data: "x" }),
    {
      version: 1,
      action: "input",
      data: "x",
    }
  )
  assert.equal(
    tuiSurfaceActionSchema.safeParse({
      action: "resize",
      version: 1,
      columns: 0,
      rows: 24,
    }).success,
    false
  )
  assert.equal(
    tuiSurfaceActionSchema.safeParse({
      action: "input",
      version: 1,
      data: "x".repeat(65_537),
    }).success,
    false
  )
})

test("resource protocol preserves scope, trust, and package operations", () => {
  const catalog = resourceCatalogSchema.parse({
    cwd: "/workspace",
    projectTrusted: false,
    trustRequired: true,
    resources: [
      {
        id: "extension-a",
        type: "extension",
        name: "extension.ts",
        scope: "global",
        source: "explicit-path",
        sourcePath: "/agent/extensions/extension.ts",
        enabled: true,
        inherited: false,
        overridden: false,
        missing: false,
        reloadRequired: false,
      },
    ],
    packages: [],
  })
  assert.equal(catalog.resources[0]?.scope, "global")
  assert.equal(
    hostToWorkerMessageSchema.parse({
      type: "packages.remove",
      requestId: "request-a",
      payload: {
        cwd: "/workspace",
        agentDir: "/agent",
        packageId: "package-a",
      },
    }).type,
    "packages.remove"
  )
  assert.equal(
    hostToWorkerMessageSchema.safeParse({
      type: "resources.set-enabled",
      requestId: "request-a",
      payload: {
        cwd: "/workspace",
        agentDir: "/agent",
        resourceId: "extension-a",
        writeScope: "global",
        enabled: false,
      },
    }).success,
    false
  )
  assert.equal(
    hostToWorkerMessageSchema.parse({
      type: "resources.set-enabled",
      requestId: "request-b",
      payload: {
        cwd: "/workspace",
        agentDir: "/agent",
        resourceId: "extension-a",
        resourceType: "extension",
        writeScope: "global",
        enabled: false,
      },
    }).type,
    "resources.set-enabled"
  )
})
