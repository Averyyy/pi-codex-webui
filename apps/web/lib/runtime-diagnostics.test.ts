import assert from "node:assert/strict"
import test from "node:test"

import {
  protocolEventSchema,
  runtimeDiagnosticsSchema,
} from "./runtime-diagnostics"

const event = {
  id: "event-1",
  seq: 1,
  type: "runtime.ready",
  sessionId: "session-1",
  timestamp: "2026-08-04T10:00:00.000Z",
  payload: {},
}

test("runtime diagnostics validates complete snapshots", () => {
  assert.equal(
    runtimeDiagnosticsSchema.parse({
      status: "ready",
      active: true,
      pid: 123,
      runtimeKind: "pi",
      runtimeProfileId: "pi-default",
      cwd: "/tmp/project",
      workerPath: "/tmp/worker.mjs",
      startedAt: "2026-08-04T09:59:00.000Z",
      lastActivityAt: "2026-08-04T10:00:00.000Z",
      pendingRequests: 0,
      activeMcpCalls: 0,
      mcpServers: [],
      activeTools: [],
      crash: null,
      events: [event],
    }).events[0]?.type,
    "runtime.ready"
  )
})

test("runtime diagnostics rejects invalid counts and protocol events", () => {
  assert.equal(
    runtimeDiagnosticsSchema.safeParse({
      status: "ready",
      active: true,
      pid: 123,
      runtimeKind: "pi",
      runtimeProfileId: "pi-default",
      cwd: "/tmp/project",
      workerPath: "/tmp/worker.mjs",
      startedAt: "2026-08-04T09:59:00.000Z",
      lastActivityAt: "2026-08-04T10:00:00.000Z",
      pendingRequests: -1,
      activeMcpCalls: 0,
      mcpServers: [],
      activeTools: [],
      crash: null,
      events: [event],
    }).success,
    false
  )
  assert.equal(
    protocolEventSchema.safeParse({ ...event, timestamp: "not-a-date" })
      .success,
    false
  )
})
