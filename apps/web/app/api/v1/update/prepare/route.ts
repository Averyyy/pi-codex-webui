import { z } from "zod"

import {
  cancelUpdatePreparation,
  prepareForUpdate,
} from "@/lib/update-maintenance"
import { validateUpdateControlRequest } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const operationSchema = z
  .object({
    operationId: z.string().trim().min(1).max(200),
  })
  .strict()

function noStore() {
  return { "Cache-Control": "no-store" }
}

export async function POST(request: Request) {
  const securityError = validateUpdateControlRequest(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    return Response.json(await prepareForUpdate(), { headers: noStore() })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

async function operationIdFromRequest(request: Request) {
  const header = request.headers.get("x-pi-web-codex-update-operation-id")
  if (header) return header

  try {
    const body = operationSchema.parse(await request.json())
    return body.operationId
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    if (error instanceof z.ZodError) return undefined
    throw error
  }
}

export async function DELETE(request: Request) {
  const securityError = validateUpdateControlRequest(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const operationId = await operationIdFromRequest(request)
    const cancelled = cancelUpdatePreparation(operationId)
    return Response.json({ ok: true, cancelled }, { headers: noStore() })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
