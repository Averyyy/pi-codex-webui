import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const compactSchema = z.object({
  instructions: z.string().trim().min(1).max(10_000).optional(),
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/compact">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = compactSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid compaction request." },
        { status: 400 }
      )
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().compact(sessionId, parsed.data.instructions),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
