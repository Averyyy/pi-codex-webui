import { z } from "zod"
import { thinkingLevelSchema } from "@workspace/runtime-protocol"

import { promptImagesSchema } from "@/lib/prompt-images"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const claimSchema = z.object({
  leaseToken: z.string().trim().min(1),
  leaseId: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(100_000),
  images: promptImagesSchema,
  model: z
    .object({
      provider: z.string().trim().min(1),
      modelId: z.string().trim().min(1),
    })
    .optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/runtime-drafts/[draftId]/claim">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { draftId } = await context.params
    const parsed = claimSchema.parse(await readJsonBody(request))
    return Response.json(
      await getRuntimeSupervisor().claimRuntimeDraft({ draftId, ...parsed }),
      {
        status: 202,
        headers: { "Cache-Control": "no-store" },
      }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid runtime draft claim." },
        { status: 400 }
      )
    }
    return runtimeErrorResponse(error)
  }
}
