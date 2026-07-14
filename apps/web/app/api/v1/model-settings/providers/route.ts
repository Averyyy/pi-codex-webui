import { modelSettingsProviderInputSchema } from "@workspace/runtime-protocol"

import { resolveModelSettingsCwd } from "@/lib/model-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const parsed = modelSettingsProviderInputSchema.safeParse(
      await readJsonBody(request)
    )
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid custom provider." },
        { status: 400 }
      )
    }
    const sessionId =
      new URL(request.url).searchParams.get("sessionId") ?? undefined
    const cwd = await resolveModelSettingsCwd(sessionId)
    if (!cwd)
      return Response.json({ error: "Session not found." }, { status: 404 })
    const settings = await getRuntimeSupervisor().saveCustomProvider(
      cwd,
      parsed.data
    )
    return Response.json(settings, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
