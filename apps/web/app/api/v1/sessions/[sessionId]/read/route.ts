import { markSessionRead } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/read">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const { sessionId } = await context.params
  if (!(await markSessionRead(sessionId))) {
    return Response.json({ error: "Session not found." }, { status: 404 })
  }
  return Response.json({ sessionId, unread: false })
}
