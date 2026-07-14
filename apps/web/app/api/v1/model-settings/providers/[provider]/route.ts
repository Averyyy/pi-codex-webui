import { resolveModelSettingsCwd } from "@/lib/model-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
