import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/activate">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const { sessionId } = await context.params
  try {
    await getRuntimeSupervisor().activate(sessionId)
    return Response.json(getRuntimeSupervisor().state(sessionId), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
