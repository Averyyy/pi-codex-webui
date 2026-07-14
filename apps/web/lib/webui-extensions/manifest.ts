import { z } from "zod"

import type {
  PiWebCodexManifest,
  WebUiExtensionContribution,
} from "@pi-web-codex/extension-sdk"

import { webUiExtensionIdSchema } from "../config-schema"

const packageNameSchema = z
  .string()
  .min(1)
  .max(214)
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/
  )

const relativeAssetPathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/^[a-zA-Z]:/.test(value) &&
      !value.split(/[\\/]/).includes(".."),
    "Adapter entrypoints must stay inside their package."
  )

const targetSchema = z
  .object({
    packageName: packageNameSchema.optional(),
    extensionPath: z.string().min(1).max(1_024).optional(),
    version: z.string().min(1).max(128).optional(),
    testedVersions: z.array(z.string().min(1).max(128)).max(100).optional(),
    compatibility: z
      .object({
        mode: z.literal("probe"),
        onUntestedVersion: z.enum(["allow-if-probe-passes", "reject"]),
      })
      .optional(),
  })
  .refine(
    (target) =>
      target.packageName !== undefined || target.extensionPath !== undefined,
    "Adapter targets need a package name or extension path."
  )

const contributesSchema = z
  .object({
    commandAdapters: z
      .array(
        z.object({
          command: z.string().min(1).max(128),
          handler: z.string().min(1).max(128),
        })
      )
      .max(100)
      .optional(),
    rendererAdapters: z
      .array(
        z.object({
          kind: z.enum(["tool", "message", "entry"]),
          name: z.string().min(1).max(128),
          handler: z.string().min(1).max(128),
        })
      )
      .max(100)
      .optional(),
  })
  .refine(
    (value) =>
      (value.commandAdapters?.length ?? 0) +
        (value.rendererAdapters?.length ?? 0) >
      0,
    "Adapter must contribute at least one handler."
  )

export const webUiExtensionContributionSchema: z.ZodType<WebUiExtensionContribution> =
  z.object({
    id: webUiExtensionIdSchema,
    name: z.string().trim().min(1).max(100).optional(),
    target: targetSchema,
    runtimes: z
      .array(z.enum(["pi", "pi-client"]))
      .min(1)
      .max(2),
    worker: relativeAssetPathSchema,
    client: relativeAssetPathSchema,
    style: relativeAssetPathSchema.optional(),
    contributes: contributesSchema,
  })

export const piWebCodexManifestSchema: z.ZodType<PiWebCodexManifest> = z.object(
  {
    apiVersion: z.literal(1),
    host: z.object({
      version: z.string().min(1).max(128),
      protocolVersion: z.literal(1),
    }),
    extensions: z.array(webUiExtensionContributionSchema).min(1).max(100),
  }
)

export const adapterPackageSchema = z.object({
  name: packageNameSchema,
  version: z.string().min(1).max(128),
  piWebCodex: piWebCodexManifestSchema,
})
