import { z } from "zod"
import type { ModelSettings } from "@workspace/runtime-protocol"

import { resolveModelSettingsRequestTarget } from "@/lib/model-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mutationSchema = z.object({
  enabledModelIds: z.array(z.string().min(1)).nullable(),
  expectedEnabledModelIds: z.array(z.string().min(1)),
})

function response(settings: ModelSettings) {
  return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams
    const scope = searchParams.get("scope") ?? "all"
    if (scope !== "all" && scope !== "enabled") {
      return Response.json({ error: "Invalid model scope." }, { status: 400 })
    }
    const target = await resolveModelSettingsRequestTarget({
      sessionId: searchParams.get("sessionId") ?? undefined,
      projectId: searchParams.get("projectId") ?? undefined,
      newTask: searchParams.get("newTask") === "1",
    })
    if (!target)
      return Response.json({ error: "Session not found." }, { status: 404 })
    return response(await getRuntimeSupervisor().modelSettings(target, scope))
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
    const searchParams = new URL(request.url).searchParams
    const target = await resolveModelSettingsRequestTarget({
      sessionId: searchParams.get("sessionId") ?? undefined,
      projectId: searchParams.get("projectId") ?? undefined,
      newTask: searchParams.get("newTask") === "1",
    })
    if (!target)
      return Response.json({ error: "Session not found." }, { status: 404 })
    return response(
      await getRuntimeSupervisor().setModelScope(
        target,
        parsed.data.enabledModelIds,
        parsed.data.expectedEnabledModelIds
      )
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
