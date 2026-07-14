import { z } from "zod"

import { getSessionSnapshot } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

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

const renameSchema = z.object({ name: z.string().trim().min(1).max(200) })

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = renameSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json({ error: "Invalid session name." }, { status: 400 })
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().rename(sessionId, parsed.data.name),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().deleteArchivedSession(sessionId)
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
