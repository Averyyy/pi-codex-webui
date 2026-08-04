import { z, ZodError } from "zod"

import { ConfigConflictError, loadConfig, patchConfig } from "@/lib/config"
import { webUiExtensionIdSchema } from "@/lib/config-schema"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { loadWebUiExtensionCatalog } from "@/lib/webui-extension-settings-data"

export const runtime = "nodejs"

const preferenceSchema = z.object({
  projectId: z.string().min(1).optional(),
  enabled: z.boolean(),
  rendering: z.enum(["native", "tui"]),
  selectedAdapter: z.string().min(1).max(512).nullable(),
})

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/webui-extensions/[extensionId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const revision = request.headers
    .get("if-match")
    ?.match(/^"revision-(\d+)"$/)?.[1]
  if (!revision) {
    return Response.json(
      { error: "A valid If-Match header is required." },
      { status: 428 }
    )
  }
  let selectedProjectId: string | null = null
  try {
    const extensionId = webUiExtensionIdSchema.parse(
      (await context.params).extensionId
    )
    const preference = preferenceSchema.parse(await request.json())
    selectedProjectId = preference.projectId ?? null
    const data = await loadWebUiExtensionCatalog(selectedProjectId)
    const group = data.catalog.groups.find((item) => item.id === extensionId)
    if (!group) {
      return Response.json(
        { error: "WebUI extension not found." },
        { status: 404 }
      )
    }
    if (
      preference.selectedAdapter &&
      !group.candidates.some(
        (candidate) => candidate.key === preference.selectedAdapter
      )
    ) {
      return Response.json(
        { error: "Selected WebUI adapter is not available." },
        { status: 400 }
      )
    }
    const config = await loadConfig()
    await patchConfig(Number(revision), {
      webuiExtensions: {
        preferences: {
          ...config.webuiExtensions.preferences,
          [extensionId]: {
            enabled: preference.enabled,
            rendering: preference.rendering,
            selectedAdapter: preference.selectedAdapter,
          },
        },
      },
    })
    void getRuntimeSupervisor().refreshWebUiExtensions()
    const next = await loadWebUiExtensionCatalog(selectedProjectId)
    return Response.json(next.catalog, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof ConfigConflictError) {
      const current = await loadWebUiExtensionCatalog(selectedProjectId)
      return Response.json(
        {
          error: error.message,
          code: "ConfigConflict",
          current: current.catalog,
        },
        { status: 409 }
      )
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid WebUI extension settings." },
        { status: 400 }
      )
    }
    return runtimeErrorResponse(error)
  }
}
