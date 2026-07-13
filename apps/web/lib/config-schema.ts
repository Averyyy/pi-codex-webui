import { z } from "zod"

import { DEFAULT_HOST, DEFAULT_PORT } from "./app"

export const themeSchema = z.enum(["system", "light", "dark"])
export const runtimeKindSchema = z.enum(["pi", "pi-client"])

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
  fontSize: z.number().int().min(12).max(18),
  sidebarWidth: z.number().int().min(240).max(360),
})

export const configSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  server: serverSchema,
  appearance: appearanceSchema,
  developer: developerSchema,
})

export const configPatchSchema = z
  .object({
    server: serverSchema.pick({ port: true, openBrowser: true }).partial(),
    appearance: appearanceSchema.partial(),
    developer: developerSchema,
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

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 1,
  revision: 0,
  server: {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    openBrowser: true,
  },
  appearance: {
    theme: "system",
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
}

export function parseConfig(value: unknown): AppConfig {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !("developer" in value)
  ) {
    return configSchema.parse({
      ...value,
      developer: structuredClone(DEFAULT_CONFIG.developer),
    })
  }
  return configSchema.parse(value)
}

export function mergeConfig(config: AppConfig, patch: ConfigPatch): AppConfig {
  return configSchema.parse({
    ...config,
    server: { ...config.server, ...patch.server },
    appearance: { ...config.appearance, ...patch.appearance },
    developer: patch.developer ?? config.developer,
  })
}
