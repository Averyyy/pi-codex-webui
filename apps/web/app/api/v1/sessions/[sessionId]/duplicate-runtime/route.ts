import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const duplicateSchema = z.object({
  runtimeProfileId: z.string().min(1),
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/duplicate-runtime">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const input = duplicateSchema.safeParse(await readJsonBody(request))
    if (!input.success) {
      return Response.json(
        { error: "A target runtime profile is required." },
        { status: 400 }
      )
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().duplicateIntoRuntime(
        sessionId,
        input.data.runtimeProfileId
      ),
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
