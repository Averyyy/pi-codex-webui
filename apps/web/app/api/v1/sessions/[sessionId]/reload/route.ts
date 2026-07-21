import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/reload">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { sessionId } = await context.params
    return Response.json(await getRuntimeSupervisor().reload(sessionId), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
