import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/stats">
) {
  try {
    const { sessionId } = await context.params
    return Response.json(await getRuntimeSupervisor().stats(sessionId), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
