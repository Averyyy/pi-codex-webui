import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const actionSchema = z.object({
  instanceId: z.uuid(),
  input: z.unknown().optional(),
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/webui-extensions/[extensionId]/actions/[actionId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = actionSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json({ error: "Invalid WebUI action." }, { status: 400 })
    }
    const { sessionId, extensionId, actionId } = await context.params
    const result = await getRuntimeSupervisor().invokeWebUiAction(
      sessionId,
      extensionId,
      parsed.data.instanceId,
      actionId,
      parsed.data.input
    )
    return Response.json({ result })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
