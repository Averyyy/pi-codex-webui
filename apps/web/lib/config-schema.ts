import { z } from "zod"

import { DEFAULT_HOST, DEFAULT_PORT } from "./app"
import { DEFAULT_LOCALE, locales } from "./i18n"

export const themeSchema = z.enum(["system", "light", "dark"])
export const languageSchema = z.enum(locales)
export const runtimeKindSchema = z.enum(["pi", "pi-client"])

export const secretReferenceSchema = z
  .object({ $secret: z.string().uuid() })
  .strict()

export const mcpServerIdSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const mcpStoredValueSchema = z.union([
  z.string().max(8_192),
  secretReferenceSchema,
])

const mcpToolNameSchema = z.string().min(1).max(128)

const mcpServerSchema = z
  .object({
    id: mcpServerIdSchema,
    name: z.string().trim().min(1).max(80),
    scope: z.enum(["global", "project"]),
    projectId: z.string().min(1).nullable(),
    enabled: z.boolean(),
    transport: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("stdio"),
        command: z.string().trim().min(1).max(2_048),
        args: z.array(z.string().max(8_192)).max(200),
        cwd: z.string().max(2_048).nullable(),
      }),
      z.object({
        type: z.literal("http"),
        url: z.url({ protocol: /^https?$/ }).max(2_048),
        headers: z.record(z.string().min(1).max(256), mcpStoredValueSchema),
      }),
    ]),
    env: z.record(z.string().min(1).max(256), mcpStoredValueSchema),
    timeoutMs: z.number().int().min(1_000).max(600_000),
    enabledTools: z.array(mcpToolNameSchema).max(1_000),
    disabledTools: z.array(mcpToolNameSchema).max(1_000),
  })
  .superRefine((server, context) => {
    if (server.scope === "project" && !server.projectId) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Project-scoped MCP servers require a project ID.",
      })
    }
    if (server.scope === "global" && server.projectId !== null) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Global MCP servers cannot have a project ID.",
      })
    }
    for (const key of ["enabledTools", "disabledTools"] as const) {
      if (new Set(server[key]).size !== server[key].length) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} cannot contain duplicates.`,
        })
      }
    }
  })

const mcpSchema = z
  .object({
    servers: z.record(mcpServerIdSchema, mcpServerSchema),
  })
  .superRefine((mcp, context) => {
    for (const [id, server] of Object.entries(mcp.servers)) {
      if (id !== server.id) {
        context.addIssue({
          code: "custom",
          path: ["servers", id, "id"],
          message: "MCP server map key must match the server ID.",
        })
      }
    }
  })

export const runtimeProfileIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const piRuntimeProfileSchema = z.object({
  kind: z.literal("pi"),
  enabled: z.literal(true),
})

export const piClientRuntimeProfileSchema = z.object({
  kind: z.literal("pi-client"),
  enabled: z.boolean(),
  serverUrl: z.string().max(2_048),
  authTokenRef: z.string().uuid().nullable(),
})

export const runtimeProfileSchema = z.discriminatedUnion("kind", [
  piRuntimeProfileSchema,
  piClientRuntimeProfileSchema,
])

const runtimeSettingsSchema = z
  .object({
    default: runtimeProfileIdSchema,
    profiles: z.record(runtimeProfileIdSchema, runtimeProfileSchema),
  })
  .superRefine((runtime, context) => {
    const selected = runtime.profiles[runtime.default]
    if (!selected) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Default runtime profile does not exist.",
      })
    } else if (!selected.enabled) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Default runtime profile must be enabled.",
      })
    }
    if (runtime.profiles.pi?.kind !== "pi") {
      context.addIssue({
        code: "custom",
        path: ["profiles", "pi"],
        message: "The built-in Pi runtime profile is required.",
      })
    }
  })

const developerSchema = z.object({
  runtime: runtimeSettingsSchema,
})

const serverSchema = z.object({
  host: z.literal(DEFAULT_HOST),
  port: z.number().int().min(1).max(65535),
  openBrowser: z.boolean(),
})

const appearanceSchema = z.object({
  theme: themeSchema,
  language: languageSchema.default(DEFAULT_LOCALE),
  fontSize: z.number().int().min(12).max(18),
  sidebarWidth: z.number().int().min(240).max(360),
})

export const webUiExtensionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)

const webUiExtensionPreferenceSchema = z.object({
  enabled: z.boolean(),
  rendering: z.enum(["native", "tui"]),
  selectedAdapter: z.string().min(1).max(512).nullable(),
})

const webUiExtensionsSchema = z.object({
  preferences: z.record(webUiExtensionIdSchema, webUiExtensionPreferenceSchema),
})

export const configSchema = z.object({
  schemaVersion: z.literal(3),
  revision: z.number().int().nonnegative(),
  server: serverSchema,
  appearance: appearanceSchema,
  developer: developerSchema,
  mcp: mcpSchema,
  webuiExtensions: webUiExtensionsSchema,
})

export const configPatchSchema = z
  .object({
    server: serverSchema.pick({ port: true, openBrowser: true }).partial(),
    appearance: appearanceSchema.partial(),
    developer: developerSchema,
    mcp: mcpSchema,
    webuiExtensions: webUiExtensionsSchema,
  })
  .partial()
  .refine(
    (patch) =>
      Object.values(patch).some(
        (section) => section && Object.keys(section).length > 0
      ),
    "At least one setting must be provided."
  )

export type AppConfig = z.infer<typeof configSchema>
export type ConfigPatch = z.infer<typeof configPatchSchema>
export type McpServerConfig = AppConfig["mcp"]["servers"][string]
export type McpStoredValue = z.infer<typeof mcpStoredValueSchema>

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 3,
  revision: 0,
  server: {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    openBrowser: true,
  },
  appearance: {
    theme: "system",
    language: DEFAULT_LOCALE,
    fontSize: 14,
    sidebarWidth: 296,
  },
  developer: {
    runtime: {
      default: "pi",
      profiles: {
        pi: { kind: "pi", enabled: true },
        "pi-client-default": {
          kind: "pi-client",
          enabled: false,
          serverUrl: "",
          authTokenRef: null,
        },
      },
    },
  },
  mcp: {
    servers: {},
  },
  webuiExtensions: {
    preferences: {},
  },
}

export function parseConfig(value: unknown): AppConfig {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const legacy = value as Record<string, unknown>
    if (legacy.schemaVersion === 1 || legacy.schemaVersion === 2) {
      return configSchema.parse({
        ...legacy,
        schemaVersion: 3,
        developer:
          legacy.developer ?? structuredClone(DEFAULT_CONFIG.developer),
        mcp: legacy.mcp ?? structuredClone(DEFAULT_CONFIG.mcp),
        webuiExtensions: structuredClone(DEFAULT_CONFIG.webuiExtensions),
      })
    }
  }
  return configSchema.parse(value)
}

export function mergeConfig(config: AppConfig, patch: ConfigPatch): AppConfig {
  return configSchema.parse({
    ...config,
    server: { ...config.server, ...patch.server },
    appearance: { ...config.appearance, ...patch.appearance },
    developer: patch.developer ?? config.developer,
    mcp: patch.mcp ?? config.mcp,
    webuiExtensions: patch.webuiExtensions ?? config.webuiExtensions,
  })
}
