import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const leaseSchema = z.object({ leaseId: z.string().trim().min(1).max(200) })

async function readLease(request: Request) {
  return leaseSchema.parse(await readJsonBody(request)).leaseId
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/runtime/lease">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { sessionId } = await context.params
    const leaseId = await readLease(request)
    return Response.json(
      await getRuntimeSupervisor().retainRuntimeLease(sessionId, leaseId),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid runtime lease." }, { status: 400 })
    }
    return runtimeErrorResponse(error)
  }
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/runtime/lease">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { sessionId } = await context.params
    const leaseId = await readLease(request)
    return Response.json(
      getRuntimeSupervisor().refreshRuntimeLease(sessionId, leaseId),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid runtime lease." }, { status: 400 })
    }
    return runtimeErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/runtime/lease">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { sessionId } = await context.params
    const leaseId = await readLease(request)
    getRuntimeSupervisor().releaseRuntimeLease(sessionId, leaseId)
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid runtime lease." }, { status: 400 })
    }
    return runtimeErrorResponse(error)
  }
}
