import { z } from "zod"

import { promptImagesSchema } from "@/lib/prompt-images"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const messageSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
  images: promptImagesSchema,
  streamingBehavior: z.enum(["steer", "followUp"]).default("followUp"),
  editEntryId: z.string().min(1).optional(),
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/messages">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = messageSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid prompt.", issues: parsed.error.issues },
        { status: 400 }
      )
    }
    const { sessionId } = await context.params
    const supervisor = getRuntimeSupervisor()
    const { editEntryId, ...prompt } = parsed.data
    return Response.json(
      editEntryId
        ? await supervisor.editMessage(sessionId, editEntryId, prompt)
        : await supervisor.prompt(sessionId, prompt),
      { status: 202, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
