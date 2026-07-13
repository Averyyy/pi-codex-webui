import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const MAX_IMPORT_BYTES = 32 * 1024 * 1024

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/import">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const file = (await request.formData()).get("file")
  if (!(file instanceof File) || !file.name.endsWith(".jsonl")) {
    return Response.json(
      { error: "A JSONL session file is required." },
      { status: 400 }
    )
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return Response.json(
      { error: "The JSONL file exceeds 32 MiB." },
      { status: 413 }
    )
  }
  try {
    const { sessionId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().importSession(
        sessionId,
        new Uint8Array(await file.arrayBuffer())
      ),
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
