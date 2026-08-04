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
