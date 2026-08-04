import { z } from "zod"

import { webUiExtensionStatusSchema } from "@workspace/runtime-protocol"

import type { WebUiExtensionCatalogView } from "./types"

const assetSchema = z.object({
  digest: z.string().min(1),
  file: z.string().min(1),
  url: z.string().min(1),
})

const targetSchema = z
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

export const webUiExtensionCatalogSchema = z.object({
  revision: z.number().int().nonnegative(),
  projectId: z.string().nullable(),
  projectTrusted: z.boolean(),
  groups: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      preference: z.object({
        enabled: z.boolean(),
        rendering: z.enum(["native", "tui"]),
        selectedAdapter: z.string().min(1).nullable(),
      }),
      candidates: z.array(
        z.object({
          key: z.string().min(1),
          source: z.enum(["builtin", "external", "project", "development"]),
          packageName: z.string().min(1),
          packageVersion: z.string().min(1),
          target: targetSchema,
          runtimes: z.array(z.enum(["pi", "pi-client"])),
          client: assetSchema,
          style: assetSchema.optional(),
        })
      ),
    })
  ),
  diagnostics: z.array(z.object({ path: z.string(), message: z.string() })),
  statuses: z.array(
    webUiExtensionStatusSchema.extend({ sessionId: z.string().min(1) })
  ),
})

export function parseWebUiExtensionCatalog(value: unknown) {
  return webUiExtensionCatalogSchema.parse(value) as WebUiExtensionCatalogView
}
