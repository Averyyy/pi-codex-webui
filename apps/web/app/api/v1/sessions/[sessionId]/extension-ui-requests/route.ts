import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/extension-ui-requests">
) {
  const { sessionId } = await context.params
  return Response.json(getRuntimeSupervisor().pendingExtensionUI(sessionId), {
    headers: { "Cache-Control": "no-store" },
  })
}
