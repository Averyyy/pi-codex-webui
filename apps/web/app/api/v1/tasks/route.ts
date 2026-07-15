import { z } from "zod"

import { listWorkspaceTasks } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSchema = z.object({
  runtimeProfileId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(100_000).optional(),
  model: z
    .object({
      provider: z.string().min(1),
      modelId: z.string().min(1),
    })
    .optional(),
})

export async function GET() {
  return Response.json(
    { tasks: await listWorkspaceTasks() },
    { headers: { "Cache-Control": "no-store" } }
  )
}

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const text = await request.text()
    const parsed = createSchema.safeParse(text ? JSON.parse(text) : {})
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid runtime profile selection." },
        { status: 400 }
      )
    }
    return Response.json(
      await getRuntimeSupervisor().createTask({
        runtimeProfileId: parsed.data.runtimeProfileId,
        initialMessage: parsed.data.message,
        model: parsed.data.model,
      }),
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    )
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      )
    }
    return runtimeErrorResponse(error)
  }
}
