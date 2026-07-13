import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const navigateSchema = z.object({
  entryId: z.string().min(1),
  summarize: z.boolean().default(false),
})

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/tree">
) {
  try {
    const { sessionId } = await context.params
    return Response.json(await getRuntimeSupervisor().tree(sessionId), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/tree">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = navigateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json({ error: "Invalid tree target." }, { status: 400 })
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().navigateTree(
        sessionId,
        parsed.data.entryId,
        parsed.data.summarize
      ),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
