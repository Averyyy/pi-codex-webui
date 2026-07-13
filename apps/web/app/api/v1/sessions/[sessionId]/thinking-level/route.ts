import { thinkingLevelSchema } from "@workspace/runtime-protocol"
import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const thinkingSchema = z.object({ level: thinkingLevelSchema })

export async function PUT(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/thinking-level">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = thinkingSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid thinking level." },
        { status: 400 }
      )
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().setThinkingLevel(
        sessionId,
        parsed.data.level
      ),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
