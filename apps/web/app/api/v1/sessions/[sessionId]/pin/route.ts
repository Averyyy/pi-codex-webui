import { z } from "zod"

import { setSessionPinned } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody } from "@/lib/runtime-api"

export const runtime = "nodejs"

const updateSchema = z.object({ pinned: z.boolean() }).strict()

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/pin">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const parsed = updateSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) {
    return Response.json({ error: "Invalid pinned state." }, { status: 400 })
  }

  const { sessionId } = await context.params
  if (!(await setSessionPinned(sessionId, parsed.data.pinned))) {
    return Response.json({ error: "Session not found." }, { status: 404 })
  }
  return Response.json({ sessionId, pinned: parsed.data.pinned })
}
