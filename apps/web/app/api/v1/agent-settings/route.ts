import { z } from "zod"
import { agentSettingsSchema } from "@workspace/runtime-protocol"

import { resolveModelSettingsRequestTarget } from "@/lib/model-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function target(request: Request) {
  const params = new URL(request.url).searchParams
  return resolveModelSettingsRequestTarget({
    sessionId: params.get("sessionId") ?? undefined,
    projectId: params.get("projectId") ?? undefined,
    newTask: !params.has("sessionId") && !params.has("projectId"),
  })
}

export async function GET(request: Request) {
  try {
    const selected = await target(request)
    if (!selected)
      return Response.json({ error: "Session not found." }, { status: 404 })
    return Response.json(await getRuntimeSupervisor().agentSettings(selected), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function PATCH(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError)
    return Response.json({ error: securityError }, { status: 403 })
  try {
    const parsed = z
      .object({ settings: agentSettingsSchema, expected: agentSettingsSchema })
      .safeParse(await readJsonBody(request))
    if (!parsed.success)
      return Response.json(
        { error: "Invalid agent settings.", issues: parsed.error.issues },
        { status: 400 }
      )
    const selected = await target(request)
    if (!selected)
      return Response.json({ error: "Session not found." }, { status: 404 })
    return Response.json(
      await getRuntimeSupervisor().setAgentSettings(
        selected,
        parsed.data.settings,
        parsed.data.expected
      ),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
