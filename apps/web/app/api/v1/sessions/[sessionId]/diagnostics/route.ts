import { getSessionRuntimeTarget } from "@/lib/catalog"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/diagnostics">
) {
  const { sessionId } = await context.params
  if (!(await getSessionRuntimeTarget(sessionId))) {
    return Response.json({ error: "Session not found." }, { status: 404 })
  }
  return Response.json(getRuntimeSupervisor().diagnostics(sessionId), {
    headers: { "Cache-Control": "no-store" },
  })
}
