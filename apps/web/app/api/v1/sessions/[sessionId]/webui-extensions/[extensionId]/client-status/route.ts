import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const statusSchema = z.object({
  instanceId: z.uuid(),
  status: z.enum(["ready", "error", "disposed"]),
  message: z.string().max(4_096).optional(),
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/webui-extensions/[extensionId]/client-status">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = statusSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid WebUI client status." },
        { status: 400 }
      )
    }
    const { sessionId, extensionId } = await context.params
    await getRuntimeSupervisor().reportWebUiClientStatus(
      sessionId,
      extensionId,
      parsed.data.instanceId,
      parsed.data.status,
      parsed.data.message
    )
    return new Response(null, { status: 204 })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
