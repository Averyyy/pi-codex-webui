import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const forkSchema = z.object({
  entryId: z.string().min(1),
  position: z.enum(["before", "at"]).default("at"),
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/fork">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = forkSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json({ error: "Invalid fork target." }, { status: 400 })
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().fork(
        sessionId,
        parsed.data.entryId,
        parsed.data.position
      ),
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
