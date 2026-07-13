import { tuiSurfaceActionSchema } from "@workspace/runtime-protocol"
import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const actionSchema = z.object({
  sessionId: z.string().min(1),
  action: tuiSurfaceActionSchema,
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/tui-surfaces/[surfaceId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = actionSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid TUI surface action." },
        { status: 400 }
      )
    }
    const { surfaceId } = await context.params
    await getRuntimeSupervisor().actOnTuiSurface(
      parsed.data.sessionId,
      surfaceId,
      parsed.data.action
    )
    return Response.json({ success: true })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
