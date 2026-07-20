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

export const modelProviderApiSchema = z.enum([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
])

const modelInputSchema = z.enum(["text", "image"])

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
  input: z.array(modelInputSchema),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
})

export const queuedPromptModeSchema = z.enum(["followUp", "steer"])

export const queuedPromptItemSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(100_000),
  mode: queuedPromptModeSchema,
})

export const queuedPromptItemsSchema = z
  .array(queuedPromptItemSchema)
  .max(100)
  .superRefine((items, context) => {
    const ids = new Set<string>()
    for (const [index, item] of items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Queued prompt IDs must be unique.",
          path: [index, "id"],
        })
      }
      ids.add(item.id)
    }
  })

export const runtimeSnapshotSchema = z.object({
  webSessionId: z.string().min(1),
  nativeSessionId: z.string().min(1),
  nativeSessionFile: z.string().min(1),
  leafId: z.string().nullable(),
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
  queuedPrompts: queuedPromptItemsSchema.default([]),
})

export const mcpToolDefinitionSchema = z.object({
  serverId: z.string().min(1),
  serverName: z.string().min(1),
  toolName: z.string().min(1),
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
})

export const mcpCallResultSchema = z.object({
  content: z.array(z.unknown()),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  isError: z.boolean().optional(),
})

export const mcpConnectionStatusSchema = z.enum([
  "disabled",
  "disconnected",
  "connecting",
  "connected",
  "error",
])

export const mcpConfiguredValueViewSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  secret: z.boolean(),
  configured: z.boolean(),
})

export const mcpServerViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scope: z.enum(["global", "project"]),
  projectId: z.string().nullable(),
  enabled: z.boolean(),
  transport: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("stdio"),
      command: z.string(),
      args: z.array(z.string()),
      cwd: z.string().nullable(),
    }),
    z.object({
      type: z.literal("http"),
      url: z.string(),
      headers: z.array(mcpConfiguredValueViewSchema),
    }),
  ]),
  env: z.array(mcpConfiguredValueViewSchema),
  timeoutMs: z.number().int().positive(),
  status: mcpConnectionStatusSchema,
  tools: z.array(
    z.object({
      name: z.string().min(1),
      namespacedName: z.string().min(1),
      title: z.string().optional(),
      description: z.string().optional(),
      enabled: z.boolean(),
    })
  ),
  lastConnectedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  logs: z.array(
    z.object({
      timestamp: z.string(),
      level: z.enum(["info", "stderr", "error"]),
      message: z.string(),
    })
  ),
})

export const mcpCatalogSchema = z.object({
  revision: z.number().int().nonnegative(),
  projectId: z.string().nullable(),
  projectTrusted: z.boolean(),
  servers: z.array(mcpServerViewSchema),
})

export const promptAcceptedSchema = z.object({
  accepted: z.literal(true),
  queued: z.boolean(),
})

export const queueStateSchema = z.object({
  items: queuedPromptItemsSchema,
})

export const queueUpdatedEventSchema = z.object({
  steering: z.array(z.string()),
  followUp: z.array(z.string()),
  items: queuedPromptItemsSchema,
})

export const sessionStatsSchema = z.object({
  sessionFile: z.string().optional(),
  sessionId: z.string().min(1),
  userMessages: z.number().int().nonnegative(),
  assistantMessages: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  toolResults: z.number().int().nonnegative(),
  totalMessages: z.number().int().nonnegative(),
  tokens: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),
  cost: z.number().nonnegative(),
  contextUsage: z
    .object({
      tokens: z.number().nonnegative(),
      contextWindow: z.number().positive(),
      percent: z.number().nonnegative(),
    })
    .optional(),
})

export const subagentStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "steered",
  "aborted",
  "stopped",
  "error",
])

export const subagentTerminalStatusSchema = z.enum([
  "completed",
  "steered",
  "aborted",
  "stopped",
  "error",
])

export const subagentTokenUsageSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  total: z.number().nonnegative(),
})

export const subagentRecordSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  description: z.string(),
  status: subagentStatusSchema,
  isBackground: z.boolean().optional(),
  createdAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().optional(),
  completedAt: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  tokens: subagentTokenUsageSchema.optional(),
  toolUses: z.number().int().nonnegative(),
  error: z.string().optional(),
  compactionCount: z.number().int().nonnegative(),
  lastSteer: z.string().optional(),
})

export const subagentsSnapshotSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  available: z.boolean(),
  agents: z.array(subagentRecordSchema),
})

const subagentEventBaseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  description: z.string(),
})

export const subagentCreatedEventSchema = subagentEventBaseSchema.extend({
  isBackground: z.boolean(),
})

export const subagentStartedEventSchema = subagentEventBaseSchema

export const subagentFinishedEventSchema = subagentEventBaseSchema.extend({
  status: subagentTerminalStatusSchema,
  toolUses: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  tokens: subagentTokenUsageSchema.optional(),
  error: z.string().optional(),
})

export const subagentSteeredEventSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1),
})

export const subagentCompactedEventSchema = subagentEventBaseSchema.extend({
  reason: z.string(),
  tokensBefore: z.number().nonnegative(),
  compactionCount: z.number().int().nonnegative(),
})

export const subagentRpcReplySchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.unknown().optional() }),
  z.object({ success: z.literal(false), error: z.string().min(1) }),
])

export const sessionReplacementSchema = z.object({
  cancelled: z.boolean(),
  snapshot: runtimeSnapshotSchema,
})

export const sessionTreeSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string().min(1),
      parentId: z.string().nullable(),
      type: z.string().min(1),
      timestamp: z.iso.datetime(),
      label: z.string().optional(),
      role: z.string().optional(),
      text: z.string().optional(),
    })
  ),
  leafId: z.string().nullable(),
})

export const sessionExportResultSchema = z.object({
  outputPath: z.string().min(1),
})

export const sessionNavigationResultSchema = z.object({
  cancelled: z.boolean(),
  aborted: z.boolean().optional(),
  editorText: z.string().optional(),
  leafId: z.string().nullable(),
  summaryEntry: z.unknown().optional(),
  snapshot: runtimeSnapshotSchema,
})

export const extensionUIResponseSchema = z.union([
  z.object({ value: z.string() }),
  z.object({ confirmed: z.boolean() }),
  z.object({ cancelled: z.literal(true) }),
])

export const extensionUIRequestSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("select"),
    title: z.string(),
    options: z.array(z.string()),
    timeout: z.number().int().positive().optional(),
  }),
  z.object({
    method: z.literal("confirm"),
    title: z.string(),
    message: z.string(),
    timeout: z.number().int().positive().optional(),
  }),
  z.object({
    method: z.literal("input"),
    title: z.string(),
    placeholder: z.string().optional(),
    timeout: z.number().int().positive().optional(),
  }),
  z.object({
    method: z.literal("editor"),
    title: z.string(),
    prefill: z.string().optional(),
  }),
  z.object({
    method: z.literal("notify"),
    message: z.string(),
    notifyType: z.enum(["info", "warning", "error"]).optional(),
  }),
  z.object({
    method: z.literal("setStatus"),
    statusKey: z.string().min(1),
    statusText: z.string().optional(),
  }),
  z.object({
    method: z.literal("setWidget"),
    widgetKey: z.string().min(1),
    widgetLines: z.array(z.string()).optional(),
    widgetPlacement: z.enum(["aboveEditor", "belowEditor"]).optional(),
  }),
  z.object({ method: z.literal("set_editor_text"), text: z.string() }),
  z.object({ method: z.literal("set_title"), title: z.string() }),
])

export const tuiSurfaceModeSchema = z.enum([
  "inline",
  "dialog",
  "overlay",
  "editor",
])

export const tuiSurfacePlacementSchema = z.enum([
  "header",
  "aboveEditor",
  "belowEditor",
  "footer",
])

export const tuiSurfaceProtocolVersionSchema = z.literal(1)

export const tuiSurfaceSnapshotSchema = z.object({
  version: tuiSurfaceProtocolVersionSchema,
  surfaceId: z.uuid(),
  mode: tuiSurfaceModeSchema,
  placement: tuiSurfacePlacementSchema.optional(),
  title: z.string().optional(),
  progress: z.boolean(),
  columns: z.number().int().min(20).max(400),
  rows: z.number().int().min(3).max(200),
  revision: z.number().int().nonnegative(),
  data: z.string(),
})

export const tuiSurfaceSnapshotsSchema = z.array(tuiSurfaceSnapshotSchema)

export const tuiSurfaceEventSchema = z.discriminatedUnion("kind", [
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    kind: z.literal("open"),
    surface: tuiSurfaceSnapshotSchema,
  }),
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    kind: z.literal("write"),
    surfaceId: z.uuid(),
    revision: z.number().int().positive(),
    data: z.string(),
  }),
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    kind: z.literal("title"),
    surfaceId: z.uuid(),
    title: z.string(),
  }),
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    kind: z.literal("progress"),
    surfaceId: z.uuid(),
    active: z.boolean(),
  }),
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    kind: z.literal("close"),
    surfaceId: z.uuid(),
    value: z.string().optional(),
  }),
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    kind: z.literal("submit"),
    surfaceId: z.uuid(),
    value: z.string(),
  }),
])

export const tuiSurfaceActionSchema = z.discriminatedUnion("action", [
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    action: z.literal("input"),
    data: z.string().min(1).max(65_536),
  }),
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    action: z.literal("resize"),
    columns: z.number().int().min(20).max(400),
    rows: z.number().int().min(3).max(200),
  }),
  z.object({
    version: tuiSurfaceProtocolVersionSchema,
    action: z.literal("close"),
  }),
])

export const webUiPlacementSchema = z.enum([
  "session.header",
  "session.toolbar",
  "conversation.before",
  "conversation.after",
  "composer.above",
  "composer.actions",
  "composer.below",
  "session.rightPanel",
  "session.dialog",
  "session.overlay",
])

export const webUiExtensionTargetSchema = z
  .object({
    packageName: z.string().min(1).optional(),
    extensionPath: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    testedVersions: z.array(z.string().min(1)).optional(),
    compatibility: z
      .object({
        mode: z.literal("probe"),
        onUntestedVersion: z.enum(["allow-if-probe-passes", "reject"]),
      })
      .optional(),
  })
  .refine(
    (target) =>
      target.packageName !== undefined || target.extensionPath !== undefined
  )

export const webUiExtensionContributionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  target: webUiExtensionTargetSchema,
  runtimes: z.array(z.enum(["pi", "pi-client"])).min(1),
  worker: z.string().min(1),
  client: z.string().min(1),
  style: z.string().min(1).optional(),
  contributes: z.object({
    commandAdapters: z
      .array(
        z.object({
          command: z.string().min(1),
          handler: z.string().min(1),
        })
      )
      .optional(),
    rendererAdapters: z
      .array(
        z.object({
          kind: z.enum(["tool", "message", "entry", "status"]),
          name: z.string().min(1),
          handler: z.string().min(1),
        })
      )
      .optional(),
  }),
})

export const webUiAdapterDescriptorSchema = z.object({
  key: z.string().min(1),
  source: z.enum(["builtin", "external", "project", "development"]),
  packageName: z.string().min(1),
  packageVersion: z.string().min(1),
  extension: webUiExtensionContributionSchema,
  workerPath: z.string().min(1),
  preference: z.object({
    enabled: z.boolean(),
    rendering: z.enum(["native", "tui"]),
    selectedAdapter: z.string().min(1).nullable(),
  }),
})

export const webUiViewSnapshotSchema = z.object({
  version: z.literal(1),
  extensionId: z.string().min(1),
  adapterKey: z.string().min(1),
  viewId: z.string().min(1),
  instanceId: z.uuid(),
  placement: webUiPlacementSchema,
  revision: z.number().int().nonnegative(),
  state: z.unknown(),
  title: z.string().optional(),
  blocking: z.boolean(),
})

export const webUiViewSnapshotsSchema = z.array(webUiViewSnapshotSchema)

export const webUiViewEventSchema = z.discriminatedUnion("kind", [
  z.object({
    version: z.literal(1),
    kind: z.literal("open"),
    view: webUiViewSnapshotSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("update"),
    view: webUiViewSnapshotSchema,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("close"),
    extensionId: z.string().min(1),
    instanceId: z.uuid(),
  }),
])

export const webUiExtensionStatusSchema = z.object({
  version: z.literal(1),
  extensionId: z.string().min(1),
  adapterKey: z.string().min(1).optional(),
  state: z.enum([
    "tested",
    "compatible-by-probe",
    "unknown",
    "incompatible",
    "disabled",
    "conflict",
    "tui",
    "error",
  ]),
  targetPackageName: z.string().min(1).optional(),
  targetPackageVersion: z.string().min(1).optional(),
  supportedVersion: z.string().min(1).optional(),
  testedVersions: z.array(z.string()).optional(),
  probePassed: z.boolean().optional(),
  reason: z.string().optional(),
})

export const resourceKindSchema = z.enum([
  "extension",
  "skill",
  "prompt",
  "theme",
])

export const resourceViewSchema = z.object({
  id: z.string().min(1),
  type: resourceKindSchema,
  name: z.string().min(1),
  scope: z.enum(["global", "project"]),
  source: z.enum(["package", "directory", "explicit-path"]),
  sourcePath: z.string().min(1),
  packageSource: z.string().min(1).optional(),
  enabled: z.boolean(),
  inherited: z.boolean(),
  overridden: z.boolean(),
  missing: z.boolean(),
  reloadRequired: z.boolean(),
})

export const packageViewSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  scope: z.enum(["global", "project"]),
  filtered: z.boolean(),
  installedPath: z.string().min(1).optional(),
  missing: z.boolean(),
})

export const resourceCatalogSchema = z.object({
  cwd: z.string().min(1),
  projectTrusted: z.boolean(),
  trustRequired: z.boolean(),
  resources: z.array(resourceViewSchema),
  packages: z.array(packageViewSchema),
})

export const modelSettingsModelSchema = runtimeModelSchema.extend({
  enabled: z.boolean(),
  availableThinkingLevels: z.array(thinkingLevelSchema).min(1),
  defaultThinkingLevel: thinkingLevelSchema,
})

export const modelSettingsCustomModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  reasoning: z.boolean(),
  input: z.array(modelInputSchema).min(1),
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
})

export const modelSettingsProviderInputSchema = z.object({
  provider: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  name: z.string().trim().min(1).max(100).optional(),
  api: modelProviderApiSchema,
  baseUrl: z.string().trim().min(1),
  apiKey: z.string().optional(),
  models: z.array(modelSettingsCustomModelSchema).min(1),
})

export const modelSettingsProviderSchema = z.object({
  provider: z.string().min(1),
  auth: z.enum(["api-key", "oauth", "environment"]),
  removable: z.boolean(),
  modelCount: z.number().int().nonnegative(),
  custom: z.boolean(),
  name: z.string().min(1).optional(),
  api: modelProviderApiSchema.optional(),
  baseUrl: z.string().min(1).optional(),
  apiKeyConfigured: z.boolean(),
  customModels: z.array(modelSettingsCustomModelSchema),
})

export const modelSettingsSchema = z.object({
  models: z.array(modelSettingsModelSchema),
  providers: z.array(modelSettingsProviderSchema),
  enabledModels: z.array(z.string().min(1)).nullable(),
  defaultModel: runtimeModelSchema
    .pick({ provider: true, id: true, name: true })
    .nullable(),
})

const initializeMessageSchema = z.object({
  type: z.literal("runtime.initialize"),
  requestId: z.string().min(1),
  payload: z.object({
    webSessionId: z.string().min(1),
    runtimeProfileId: z.string().min(1),
    cwd: z.string().min(1),
    agentDir: z.string().min(1),
    mcpTools: z.array(mcpToolDefinitionSchema),
    webuiAdapters: z.array(webUiAdapterDescriptorSchema),
    target: z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("resume"),
        nativeSessionFile: z.string().min(1),
      }),
      z.object({ mode: z.literal("new") }),
      z.object({
        mode: z.literal("duplicate"),
        sourceSessionFile: z.string().min(1),
      }),
    ]),
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

const replaceQueueMessageSchema = z.object({
  type: z.literal("session.queue.replace"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    expected: queuedPromptItemsSchema,
    next: queuedPromptItemsSchema,
  }),
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

const newSessionMessageSchema = z.object({
  type: z.literal("session.new"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({ nextWebSessionId: z.string().min(1) }),
})

const cloneSessionMessageSchema = z.object({
  type: z.literal("session.clone"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({ nextWebSessionId: z.string().min(1) }),
})

const forkMessageSchema = z.object({
  type: z.literal("session.fork"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    nextWebSessionId: z.string().min(1),
    entryId: z.string().min(1),
    position: z.enum(["before", "at"]).default("at"),
  }),
})

const navigateTreeMessageSchema = z.object({
  type: z.literal("session.navigate-tree"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    entryId: z.string().min(1),
    summarize: z.boolean().default(false),
  }),
})

const renameMessageSchema = z.object({
  type: z.literal("session.rename"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({ name: z.string().trim().min(1).max(200) }),
})

const sessionOperationMessageSchema = z.object({
  type: z.enum(["session.stats", "session.tree"]),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

const exportMessageSchema = z.object({
  type: z.literal("session.export"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    format: z.enum(["jsonl", "html"]),
    outputPath: z.string().min(1),
  }),
})

const importMessageSchema = z.object({
  type: z.literal("session.import"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    nextWebSessionId: z.string().min(1),
    inputPath: z.string().min(1),
    cwdOverride: z.string().min(1),
  }),
})

const rebindWebSessionMessageSchema = z.object({
  type: z.literal("runtime.rebind-web-session"),
  requestId: z.string().min(1),
  payload: z.object({ webSessionId: z.string().min(1) }),
})

const extensionUIResponseMessageSchema = z.object({
  type: z.literal("extension.ui.response"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    extensionRequestId: z.string().min(1),
    response: extensionUIResponseSchema,
  }),
})

const tuiSurfaceListMessageSchema = z.object({
  type: z.literal("tui.surface.list"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

const tuiSurfaceActionMessageSchema = z.object({
  type: z.literal("tui.surface.action"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    surfaceId: z.uuid(),
    action: tuiSurfaceActionSchema,
  }),
})

const subagentsSnapshotMessageSchema = z.object({
  type: z.literal("subagents.snapshot"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

const subagentStopMessageSchema = z.object({
  type: z.literal("subagents.stop"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({ agentId: z.string().min(1) }),
})

const webUiViewListMessageSchema = z.object({
  type: z.literal("webui.view.list"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

const webUiActionMessageSchema = z.object({
  type: z.literal("webui.action.invoke"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    extensionId: z.string().min(1),
    instanceId: z.uuid(),
    actionId: z.string().min(1),
    input: z.unknown().optional(),
  }),
})

const webUiClientStatusMessageSchema = z.object({
  type: z.literal("webui.client.status"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    extensionId: z.string().min(1),
    instanceId: z.uuid(),
    status: z.enum(["ready", "error", "disposed"]),
    message: z.string().max(4_096).optional(),
  }),
})

const shutdownMessageSchema = z.object({
  type: z.literal("runtime.shutdown"),
  requestId: z.string().min(1),
})

const mcpCallResponseMessageSchema = z.object({
  type: z.literal("mcp.call.response"),
  requestId: z.string().min(1),
  success: z.boolean(),
  result: mcpCallResultSchema.optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
})

const reloadResourcesMessageSchema = z.object({
  type: z.literal("runtime.reload-resources"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

const reloadModelSettingsMessageSchema = z.object({
  type: z.literal("runtime.reload-model-settings"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

const resourceRequestBaseSchema = z.object({
  requestId: z.string().min(1),
  payload: z.object({
    cwd: z.string().min(1),
    agentDir: z.string().min(1),
  }),
})

const resourceCatalogMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("resources.catalog"),
})

const resourceToggleMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("resources.set-enabled"),
  payload: resourceRequestBaseSchema.shape.payload.extend({
    resourceId: z.string().min(1),
    resourceType: resourceKindSchema,
    writeScope: z.enum(["global", "project"]),
    enabled: z.boolean(),
  }),
})

const packageInstallMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("packages.install"),
  payload: resourceRequestBaseSchema.shape.payload.extend({
    source: z.string().trim().min(1),
    scope: z.enum(["global", "project"]),
  }),
})

const packageRemoveMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("packages.remove"),
  payload: resourceRequestBaseSchema.shape.payload.extend({
    packageId: z.string().min(1),
  }),
})

const packageUpdateMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("packages.update"),
  payload: resourceRequestBaseSchema.shape.payload.extend({
    packageId: z.string().min(1),
  }),
})

const projectTrustMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("project.trust.set"),
  payload: resourceRequestBaseSchema.shape.payload.extend({
    trusted: z.boolean(),
  }),
})

const modelSettingsCatalogMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("models.catalog"),
})

const modelScopeSetMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("models.set-scope"),
  payload: resourceRequestBaseSchema.shape.payload.extend({
    enabledModelIds: z.array(z.string().min(1)).nullable(),
  }),
})

const providerRemoveMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("providers.remove"),
  payload: resourceRequestBaseSchema.shape.payload.extend({
    provider: z.string().min(1),
  }),
})

const providerSaveMessageSchema = resourceRequestBaseSchema.extend({
  type: z.literal("providers.save"),
  payload: resourceRequestBaseSchema.shape.payload.extend(
    modelSettingsProviderInputSchema.shape
  ),
})

export const hostToWorkerMessageSchema = z.discriminatedUnion("type", [
  initializeMessageSchema,
  promptMessageSchema,
  sessionRequestSchema,
  replaceQueueMessageSchema,
  setModelMessageSchema,
  setThinkingLevelMessageSchema,
  compactMessageSchema,
  newSessionMessageSchema,
  cloneSessionMessageSchema,
  forkMessageSchema,
  navigateTreeMessageSchema,
  renameMessageSchema,
  sessionOperationMessageSchema,
  exportMessageSchema,
  importMessageSchema,
  rebindWebSessionMessageSchema,
  extensionUIResponseMessageSchema,
  tuiSurfaceListMessageSchema,
  tuiSurfaceActionMessageSchema,
  subagentsSnapshotMessageSchema,
  subagentStopMessageSchema,
  webUiViewListMessageSchema,
  webUiActionMessageSchema,
  webUiClientStatusMessageSchema,
  reloadResourcesMessageSchema,
  reloadModelSettingsMessageSchema,
  resourceCatalogMessageSchema,
  resourceToggleMessageSchema,
  packageInstallMessageSchema,
  packageRemoveMessageSchema,
  packageUpdateMessageSchema,
  projectTrustMessageSchema,
  modelSettingsCatalogMessageSchema,
  modelScopeSetMessageSchema,
  providerRemoveMessageSchema,
  providerSaveMessageSchema,
  mcpCallResponseMessageSchema,
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

const extensionUIRequestMessageSchema = z.object({
  type: z.literal("extension.ui.request"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: extensionUIRequestSchema,
})

const tuiSurfaceEventMessageSchema = z.object({
  type: z.literal("tui.surface.event"),
  sessionId: z.string().min(1),
  payload: tuiSurfaceEventSchema,
})

const webUiViewEventMessageSchema = z.object({
  type: z.literal("webui.view.event"),
  sessionId: z.string().min(1),
  payload: webUiViewEventSchema,
})

const webUiExtensionStatusMessageSchema = z.object({
  type: z.literal("webui.extension.status"),
  sessionId: z.string().min(1),
  payload: webUiExtensionStatusSchema,
})

const mcpCallRequestMessageSchema = z.object({
  type: z.literal("mcp.call.request"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.object({
    serverId: z.string().min(1),
    toolName: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
  }),
})

const mcpCallCancelMessageSchema = z.object({
  type: z.literal("mcp.call.cancel"),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
})

export const workerToHostMessageSchema = z.discriminatedUnion("type", [
  runtimeReadyMessageSchema,
  runtimeResponseMessageSchema,
  sessionEventMessageSchema,
  runtimeLogMessageSchema,
  runtimeFatalMessageSchema,
  extensionUIRequestMessageSchema,
  tuiSurfaceEventMessageSchema,
  webUiViewEventMessageSchema,
  webUiExtensionStatusMessageSchema,
  mcpCallRequestMessageSchema,
  mcpCallCancelMessageSchema,
])

export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>
export type RuntimeModel = z.infer<typeof runtimeModelSchema>
export type RuntimeSnapshot = z.infer<typeof runtimeSnapshotSchema>
export type McpToolDefinition = z.infer<typeof mcpToolDefinitionSchema>
export type McpCallResult = z.infer<typeof mcpCallResultSchema>
export type McpConnectionStatus = z.infer<typeof mcpConnectionStatusSchema>
export type McpConfiguredValueView = z.infer<
  typeof mcpConfiguredValueViewSchema
>
export type McpServerView = z.infer<typeof mcpServerViewSchema>
export type McpCatalog = z.infer<typeof mcpCatalogSchema>
export type PromptAccepted = z.infer<typeof promptAcceptedSchema>
export type QueuedPromptMode = z.infer<typeof queuedPromptModeSchema>
export type QueuedPromptItem = z.infer<typeof queuedPromptItemSchema>
export type QueueState = z.infer<typeof queueStateSchema>
export type SessionStats = z.infer<typeof sessionStatsSchema>
export type SubagentStatus = z.infer<typeof subagentStatusSchema>
export type SubagentRecord = z.infer<typeof subagentRecordSchema>
export type SubagentsSnapshot = z.infer<typeof subagentsSnapshotSchema>
export type SessionReplacement = z.infer<typeof sessionReplacementSchema>
export type SessionTree = z.infer<typeof sessionTreeSchema>
export type SessionNavigationResult = z.infer<
  typeof sessionNavigationResultSchema
>
export type ExtensionUIRequest = z.infer<typeof extensionUIRequestSchema>
export type ExtensionUIResponse = z.infer<typeof extensionUIResponseSchema>
export type TuiSurfaceMode = z.infer<typeof tuiSurfaceModeSchema>
export type TuiSurfacePlacement = z.infer<typeof tuiSurfacePlacementSchema>
export type TuiSurfaceSnapshot = z.infer<typeof tuiSurfaceSnapshotSchema>
export type TuiSurfaceEvent = z.infer<typeof tuiSurfaceEventSchema>
export type TuiSurfaceAction = z.infer<typeof tuiSurfaceActionSchema>
export type WebUiPlacement = z.infer<typeof webUiPlacementSchema>
export type WebUiAdapterDescriptor = z.infer<
  typeof webUiAdapterDescriptorSchema
>
export type WebUiViewSnapshot = z.infer<typeof webUiViewSnapshotSchema>
export type WebUiViewEvent = z.infer<typeof webUiViewEventSchema>
export type WebUiExtensionStatus = z.infer<typeof webUiExtensionStatusSchema>
export type ResourceView = z.infer<typeof resourceViewSchema>
export type PackageView = z.infer<typeof packageViewSchema>
export type ResourceCatalog = z.infer<typeof resourceCatalogSchema>
export type ModelSettingsModel = z.infer<typeof modelSettingsModelSchema>
export type ModelSettingsCustomModel = z.infer<
  typeof modelSettingsCustomModelSchema
>
export type ModelSettingsProviderInput = z.infer<
  typeof modelSettingsProviderInputSchema
>
export type ModelProviderApi = z.infer<typeof modelProviderApiSchema>
export type ModelSettingsProvider = z.infer<typeof modelSettingsProviderSchema>
export type ModelSettings = z.infer<typeof modelSettingsSchema>
export type HostToWorkerMessage = z.infer<typeof hostToWorkerMessageSchema>
export type WorkerToHostMessage = z.infer<typeof workerToHostMessageSchema>
export type RuntimeError = z.infer<typeof runtimeErrorSchema>
