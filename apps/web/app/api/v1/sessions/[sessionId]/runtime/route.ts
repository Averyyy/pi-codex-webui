import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/runtime">
) {
  const { sessionId } = await context.params
  return Response.json(getRuntimeSupervisor().state(sessionId), {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/runtime">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const { sessionId } = await context.params
  try {
    await getRuntimeSupervisor().stop(sessionId)
    return new Response(null, { status: 204 })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
