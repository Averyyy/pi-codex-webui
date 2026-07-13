import assert from "node:assert/strict"
import test from "node:test"

import {
  extensionUIRequestSchema,
  extensionUIResponseSchema,
  hostToWorkerMessageSchema,
  promptAcceptedSchema,
  resourceCatalogSchema,
  runtimeStatusSchema,
  tuiSurfaceActionSchema,
  tuiSurfaceSnapshotSchema,
  workerToHostMessageSchema,
} from "@workspace/runtime-protocol"

import { runtimeErrorResponse } from "./runtime-api"
import { isRuntimeRequestError } from "./runtime-error"

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
