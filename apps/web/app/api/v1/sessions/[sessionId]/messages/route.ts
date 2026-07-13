import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const messageSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
  images: z
    .array(
      z.object({
        type: z.literal("image"),
        data: z.string().min(1).max(20_000_000),
        mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
      })
    )
    .max(10)
    .default([]),
  streamingBehavior: z.enum(["steer", "followUp"]).default("followUp"),
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
    return Response.json(
      await getRuntimeSupervisor().prompt(sessionId, parsed.data),
      { status: 202, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
