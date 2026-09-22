import { z } from "zod"

import {
  AppUpdateProxyError,
  getAppUpdateStatus,
  requestAppUpdate,
} from "@/lib/app-update"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const updateRequestSchema = z
  .object({
    version: z.string().trim().min(1).max(128),
  })
  .strict()

function noStore() {
  return { "Cache-Control": "no-store" }
}

export async function GET() {
  try {
    return Response.json(await getAppUpdateStatus(), { headers: noStore() })
  } catch (error) {
    if (error instanceof AppUpdateProxyError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: noStore() }
      )
    }
    throw error
  }
}

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const parsed = updateRequestSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        {
          error: "A strict update version body is required.",
          code: "InvalidUpdateRequest",
        },
        { status: 400, headers: noStore() }
      )
    }
    const result = await requestAppUpdate(parsed.data.version)
    return Response.json(result.body, {
      status: result.status,
      headers: noStore(),
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
