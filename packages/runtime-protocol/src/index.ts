import { z } from "zod"

export const thinkingLevelSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
])

export const runtimeStatusSchema = z.enum([
  "stopped",
  "starting",
  "ready",
  "busy",
  "stopping",
  "crashed",
])

export const runtimeModelSchema = z.object({
  provider: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  reasoning: z.boolean(),
  input: z.array(z.enum(["text", "image"])),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
})

export const runtimeSnapshotSchema = z.object({
  webSessionId: z.string().min(1),
  nativeSessionId: z.string().min(1),
  nativeSessionFile: z.string().min(1),
  cwd: z.string().min(1),
  sessionName: z.string().optional(),
  model: runtimeModelSchema
    .pick({ provider: true, id: true, name: true })
    .nullable(),
  availableModels: z.array(runtimeModelSchema),
  thinkingLevel: thinkingLevelSchema,
  availableThinkingLevels: z.array(thinkingLevelSchema),
  activeTools: z.array(z.string()),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
})

export const promptAcceptedSchema = z.object({
  accepted: z.literal(true),
  queued: z.boolean(),
})

const initializeMessageSchema = z.object({
  type: z.literal("runtime.initialize"),
  requestId: z.string().min(1),
  payload: z.object({
    webSessionId: z.string().min(1),
    runtimeProfileId: z.string().min(1),
    cwd: z.string().min(1),
    agentDir: z.string().min(1),
    nativeSessionFile: z.string().min(1),
  }),
})

const promptMessageSchema = z.object({
  type: z.literal("session.prompt"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    message: z.string().min(1),
    images: z
      .array(
        z.object({
          type: z.literal("image"),
          data: z.string().min(1),
          mimeType: z.string().min(1),
        })
      )
      .default([]),
    streamingBehavior: z.enum(["steer", "followUp"]),
  }),
})

const sessionRequestSchema = z.object({
  type: z.enum(["session.abort", "session.snapshot"]),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

const setModelMessageSchema = z.object({
  type: z.literal("session.set-model"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    provider: z.string().min(1),
    modelId: z.string().min(1),
  }),
})

const setThinkingLevelMessageSchema = z.object({
  type: z.literal("session.set-thinking-level"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({ level: thinkingLevelSchema }),
})

const compactMessageSchema = z.object({
  type: z.literal("session.compact"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({ instructions: z.string().min(1).optional() }),
})

const shutdownMessageSchema = z.object({
  type: z.literal("runtime.shutdown"),
  requestId: z.string().min(1),
})

export const hostToWorkerMessageSchema = z.discriminatedUnion("type", [
  initializeMessageSchema,
  promptMessageSchema,
  sessionRequestSchema,
  setModelMessageSchema,
  setThinkingLevelMessageSchema,
  compactMessageSchema,
  shutdownMessageSchema,
])

export const runtimeErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
})

const runtimeReadyMessageSchema = z.object({
  type: z.literal("runtime.ready"),
  requestId: z.string().min(1),
  payload: runtimeSnapshotSchema,
})

const runtimeResponseMessageSchema = z.object({
  type: z.literal("runtime.response"),
  requestId: z.string().min(1),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: runtimeErrorSchema.optional(),
})

const sessionEventMessageSchema = z.object({
  type: z.literal("session.event"),
  sessionId: z.string().min(1),
  seq: z.number().int().positive(),
  eventType: z.string().min(1),
  payload: z.unknown(),
})

const runtimeLogMessageSchema = z.object({
  type: z.literal("runtime.log"),
  sessionId: z.string().min(1).optional(),
  payload: z.object({
    level: z.enum(["stdout", "stderr"]),
    message: z.string(),
  }),
})

const runtimeFatalMessageSchema = z.object({
  type: z.literal("runtime.fatal"),
  error: runtimeErrorSchema,
})

export const workerToHostMessageSchema = z.discriminatedUnion("type", [
  runtimeReadyMessageSchema,
  runtimeResponseMessageSchema,
  sessionEventMessageSchema,
  runtimeLogMessageSchema,
  runtimeFatalMessageSchema,
])

export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>
export type RuntimeModel = z.infer<typeof runtimeModelSchema>
export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>
export type PromptAccepted = z.infer<typeof promptAcceptedSchema>
export type HostToWorkerMessage = z.infer<typeof hostToWorkerMessageSchema>
export type WorkerToHostMessage = z.infer<typeof workerToHostMessageSchema>
export type RuntimeError = z.infer<typeof runtimeErrorSchema>
