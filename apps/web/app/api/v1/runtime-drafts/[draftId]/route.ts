import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const leaseSchema = z.object({
  leaseToken: z.string().trim().min(1),
  leaseId: z.string().trim().min(1).max(200),
})

async function readLease(request: Request) {
  return leaseSchema.parse(await readJsonBody(request))
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/v1/runtime-drafts/[draftId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { draftId } = await context.params
    const lease = await readLease(request)
    return Response.json(
      getRuntimeSupervisor().refreshRuntimeDraftLease(
        draftId,
        lease.leaseToken,
        lease.leaseId
      ),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid runtime draft lease." },
        { status: 400 }
      )
    }
    return runtimeErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/runtime-drafts/[draftId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { draftId } = await context.params
    const lease = await readLease(request)
    await getRuntimeSupervisor().releaseRuntimeDraft(
      draftId,
      lease.leaseToken,
      lease.leaseId
    )
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid runtime draft lease." },
        { status: 400 }
      )
    }
    return runtimeErrorResponse(error)
  }
}
