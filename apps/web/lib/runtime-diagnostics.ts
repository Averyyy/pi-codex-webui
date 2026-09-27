import { z } from "zod"

import { runtimeStatusSchema } from "@workspace/runtime-protocol"

export const protocolEventSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  type: z.string().min(1),
  sessionId: z.string().optional(),
  operationId: z.string().optional(),
  timestamp: z.iso.datetime(),
  payload: z.unknown(),
})

export const DIAGNOSTIC_EVENT_TYPES = [
  "resync.required",
  "runtime.starting",
  "runtime.ready",
  "runtime.busy",
  "runtime.idle",
  "runtime.stopping",
  "runtime.stopped",
  "runtime.crashed",
  "runtime.log",
  "session.message.start",
  "session.message.update",
  "session.message.end",
  "tool.execution.start",
  "tool.execution.update",
  "tool.execution.end",
  "session.entry.appended",
  "session.leaf.changed",
  "session.name.changed",
  "session.thinking-level.changed",
  "session.event",
  "session.completed",
  "assistant.turn.start",
  "assistant.turn.end",
  "queue.updated",
  "compaction.start",
  "compaction.end",
  "retry.start",
  "retry.end",
  "extension.ui.request",
  "extension.ui.closed",
  "tui.surface",
  "webui.view",
  "webui.extension.status",
  "webui.extension.catalog.invalidated",
  "subagents.updated",
] as const

const runtimeCrashSchema = z.object({
  at: z.iso.datetime(),
  code: z.number().int().nullable(),
  signal: z.string().nullable(),
  message: z.string(),
})

export const runtimeDiagnosticsSchema = z.object({
  status: runtimeStatusSchema,
  active: z.boolean(),
  pid: z.number().int().positive().nullable(),
  runtimeKind: z.enum(["pi", "pi-client"]).nullable(),
  runtimeProfileId: z.string().nullable(),
  cwd: z.string().nullable(),
  workerPath: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  lastActivityAt: z.iso.datetime().nullable(),
  pendingRequests: z.number().int().nonnegative(),
  activeMcpCalls: z.number().int().nonnegative(),
  mcpServers: z.array(z.string()),
  activeTools: z.array(z.string()),
  crash: runtimeCrashSchema.nullable(),
  events: z.array(protocolEventSchema),
})

export type ProtocolEvent = z.infer<typeof protocolEventSchema>
export type RuntimeCrash = z.infer<typeof runtimeCrashSchema>
export type RuntimeDiagnostics = z.infer<typeof runtimeDiagnosticsSchema>
