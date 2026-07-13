import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const modelSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
})

export async function PUT(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/model">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = modelSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json({ error: "Invalid model." }, { status: 400 })
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().setModel(
        sessionId,
        parsed.data.provider,
        parsed.data.modelId
      ),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
