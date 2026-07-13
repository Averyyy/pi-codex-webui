import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { RuntimeRequestError } from "@/lib/runtime-error"
import { runtimeWorkerCredentials } from "@/lib/runtime-profiles"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/runtimes/[profileId]/test">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const { profileId } = await context.params
    const credentials = await runtimeWorkerCredentials(profileId, false)
    if (credentials.kind !== "pi-client") {
      return Response.json({ ok: true, kind: "pi", latencyMs: 0 })
    }

    const startedAt = performance.now()
    let response: Response
    try {
      response = await fetch(`${credentials.serverUrl}/api/sessions`, {
        headers: credentials.authToken
          ? { Authorization: `Bearer ${credentials.authToken}` }
          : undefined,
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      })
    } catch (error) {
      throw new RuntimeRequestError(
        "RuntimeConnectionFailed",
        error instanceof Error ? error.message : String(error)
      )
    }
    if (response.status === 401) {
      throw new RuntimeRequestError(
        "RuntimeAuthenticationFailed",
        "Pi Server rejected the authentication token."
      )
    }
    if (!response.ok) {
      throw new RuntimeRequestError(
        "RuntimeServerRejected",
        `Pi Server returned HTTP ${response.status}.`
      )
    }
    const body = (await response.json()) as { sessions?: unknown }
    if (!Array.isArray(body.sessions)) {
      throw new RuntimeRequestError(
        "RuntimeProtocolMismatch",
        "Pi Server returned an invalid sessions response."
      )
    }
    return Response.json({
      ok: true,
      kind: "pi-client",
      latencyMs: Math.round(performance.now() - startedAt),
      sessionCount: body.sessions.length,
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
