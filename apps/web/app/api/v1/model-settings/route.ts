import { z } from "zod"
import type { ModelSettings } from "@workspace/runtime-protocol"

import { resolveModelSettingsCwd } from "@/lib/model-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mutationSchema = z.object({
  enabledModelIds: z.array(z.string().min(1)).nullable(),
})

function response(settings: ModelSettings) {
  return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  try {
    const sessionId =
      new URL(request.url).searchParams.get("sessionId") ?? undefined
    const cwd = await resolveModelSettingsCwd(sessionId)
    if (!cwd)
      return Response.json({ error: "Session not found." }, { status: 404 })
    return response(await getRuntimeSupervisor().modelSettings(cwd))
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function PATCH(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const parsed = mutationSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json({ error: "Invalid model scope." }, { status: 400 })
    }
    const sessionId =
      new URL(request.url).searchParams.get("sessionId") ?? undefined
    const cwd = await resolveModelSettingsCwd(sessionId)
    if (!cwd)
      return Response.json({ error: "Session not found." }, { status: 404 })
    return response(
      await getRuntimeSupervisor().setModelScope(
        cwd,
        parsed.data.enabledModelIds
      )
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
