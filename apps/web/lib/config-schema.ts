import { z } from "zod"

import { DEFAULT_HOST, DEFAULT_PORT } from "./app"

export const themeSchema = z.enum(["system", "light", "dark"])

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
})

export const configPatchSchema = z
  .object({
    server: serverSchema.pick({ port: true, openBrowser: true }).partial(),
    appearance: appearanceSchema.partial(),
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
}

export function mergeConfig(config: AppConfig, patch: ConfigPatch): AppConfig {
  return configSchema.parse({
    ...config,
    server: { ...config.server, ...patch.server },
    appearance: { ...config.appearance, ...patch.appearance },
  })
}
