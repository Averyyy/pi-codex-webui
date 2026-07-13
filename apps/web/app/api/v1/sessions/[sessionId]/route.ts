import { getSessionSnapshot } from "@/lib/catalog"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]">
) {
  const { sessionId } = await context.params
  const snapshot = await getSessionSnapshot(sessionId)
  if (!snapshot) {
    return Response.json({ error: "Session not found." }, { status: 404 })
  }
  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  })
}
