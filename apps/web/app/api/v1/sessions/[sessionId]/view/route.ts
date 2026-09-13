import { getSessionView } from "@/lib/session-view"
import { runtimeErrorResponse } from "@/lib/runtime-api"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params
  const params = new URL(request.url).searchParams
  const previousLeaf = params.has("previousLeaf")
    ? params.get("previousLeaf") || null
    : undefined
  if (previousLeaf && previousLeaf.length > 1024)
    return Response.json({ error: "Invalid previous leaf." }, { status: 400 })
  try {
    const view = await getSessionView(sessionId, previousLeaf)
    return view
      ? Response.json(view, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "Session not found." }, { status: 404 })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
