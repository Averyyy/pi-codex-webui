import { modelSettingsProviderInputSchema } from "@workspace/runtime-protocol"

import { resolveModelSettingsCwd } from "@/lib/model-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/model-settings/providers/[provider]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const parsed = modelSettingsProviderInputSchema.safeParse(
      await readJsonBody(request)
    )
    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid custom provider.",
          code: "InvalidCustomProvider",
        },
        { status: 400 }
      )
    }
    const { provider } = await context.params
    if (parsed.data.provider !== provider) {
      return Response.json(
        {
          error: "Provider names do not match.",
          code: "ProviderMismatch",
        },
        { status: 400 }
      )
    }
    const sessionId =
      new URL(request.url).searchParams.get("sessionId") ?? undefined
    const cwd = await resolveModelSettingsCwd(sessionId)
    if (!cwd)
      return Response.json({ error: "Session not found." }, { status: 404 })
    const settings = await getRuntimeSupervisor().saveCustomProvider(
      cwd,
      parsed.data
    )
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/model-settings/providers/[provider]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const { provider } = await context.params
    const sessionId =
      new URL(request.url).searchParams.get("sessionId") ?? undefined
    const cwd = await resolveModelSettingsCwd(sessionId)
    if (!cwd)
      return Response.json({ error: "Session not found." }, { status: 404 })
    const settings = await getRuntimeSupervisor().removeProvider(cwd, provider)
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
