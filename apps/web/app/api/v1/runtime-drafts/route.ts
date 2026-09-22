import { randomUUID } from "node:crypto"

import { z } from "zod"
import { thinkingLevelSchema } from "@workspace/runtime-protocol"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const modelSchema = z.object({
  provider: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
})

const prepareSchema = z.object({
  draftId: z.string().trim().min(1).max(200).optional(),
  leaseId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).nullable(),
  runtimeProfileId: z.string().trim().min(1).optional(),
  model: modelSchema.optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
})

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = prepareSchema.parse(await readJsonBody(request))
    const draftId = parsed.draftId ?? randomUUID()
    return Response.json(
      await getRuntimeSupervisor().prepareRuntimeDraft({
        ...parsed,
        draftId,
      }),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid runtime draft." }, { status: 400 })
    }
    return runtimeErrorResponse(error)
  }
}
