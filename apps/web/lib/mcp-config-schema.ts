import { z } from "zod"

export const mcpExposureSchema = z.enum([
  "codemode",
  "codemode-deferred",
  "deferred",
  "direct",
  "hidden",
])
export const nativeMcpServerSchema = z
  .object({
    type: z.enum(["stdio", "http", "streamable-http"]).optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.url({ protocol: /^https?$/ }).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional(),
    exposure: mcpExposureSchema.optional(),
    toolExposure: z.record(z.string(), mcpExposureSchema).optional(),
    description: z.string().optional(),
    timeout: z.number().positive().optional(),
    oauth: z.record(z.string(), z.unknown()).optional(),
    auth: z.object({ provider: z.string().min(1) }).optional(),
  })
  .passthrough()

export const nativeMcpConfigSchema = z
  .object({
    mcpServers: z
      .record(z.string().regex(/^[a-zA-Z0-9_-]+$/), nativeMcpServerSchema)
      .optional(),
    autoEnableCodemode: z.boolean().optional(),
  })
  .passthrough()

export const mcpConfigFileSchema = z.object({
  path: z.string(),
  text: z.string().nullable(),
})
export const mcpSettingsSnapshotSchema = z.object({
  projectId: z.string().nullable(),
  projectTrusted: z.boolean(),
  files: z.object({
    global: mcpConfigFileSchema,
    project: mcpConfigFileSchema.nullable(),
  }),
})
export type NativeMcpServer = z.infer<typeof nativeMcpServerSchema>
export type McpConfigFile = z.infer<typeof mcpConfigFileSchema>
export type McpSettingsSnapshot = z.infer<typeof mcpSettingsSnapshotSchema>
