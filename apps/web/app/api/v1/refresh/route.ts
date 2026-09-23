import { getEventHub } from "@/lib/event-hub"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { getSessionView } from "@/lib/session-view"
import { resolveModelSettingsTarget } from "@/lib/model-settings-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId")
    if (!sessionId) {
      return Response.json({ error: "Session required." }, { status: 400 })
    }
    const view = await getSessionView(sessionId)
    if (!view?.snapshot) {
      return Response.json({ error: "Session not found." }, { status: 404 })
    }
    const supervisor = getRuntimeSupervisor()
    const cwd = view.snapshot.session.cwd
    const modelTarget = await resolveModelSettingsTarget(sessionId)
    const [catalog, settings] = await Promise.all([
      supervisor.resourceCatalog(cwd, { force: true }),
      modelTarget
        ? supervisor.modelSettings(modelTarget, "all", { force: true })
        : null,
    ])
    getEventHub().publish({
      type: "resync.required",
      sessionId,
      payload: { reason: "manual-refresh" },
    })
    return Response.json(
      {
        resources: catalog?.resources.length ?? 0,
        providers: settings?.providers.length ?? 0,
        models: settings?.models.length ?? 0,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
