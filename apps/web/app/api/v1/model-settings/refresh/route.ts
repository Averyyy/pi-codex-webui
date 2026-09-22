import { resolveModelSettingsRequestTarget } from "@/lib/model-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const searchParams = new URL(request.url).searchParams
    const target = await resolveModelSettingsRequestTarget({
      sessionId: searchParams.get("sessionId") ?? undefined,
      projectId: searchParams.get("projectId") ?? undefined,
      newTask: searchParams.get("newTask") === "1",
    })
    if (!target) {
      return Response.json({ error: "Session not found." }, { status: 404 })
    }
    return Response.json(
      await getRuntimeSupervisor().refreshModelSettings(target),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
