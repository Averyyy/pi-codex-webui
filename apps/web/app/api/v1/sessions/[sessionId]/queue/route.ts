import { z } from "zod"

import { queuedPromptItemsSchema } from "@workspace/runtime-protocol"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const replaceQueueSchema = z.object({
  expected: queuedPromptItemsSchema,
  next: queuedPromptItemsSchema,
})

export async function PUT(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/queue">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const input = replaceQueueSchema.safeParse(await readJsonBody(request))
    if (!input.success) {
      return Response.json(
        { error: "Invalid queue update.", issues: input.error.issues },
        { status: 400 }
      )
    }
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().replacePromptQueue(
        sessionId,
        input.data.expected,
        input.data.next
      ),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
