import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/export">
) {
  const format = new URL(request.url).searchParams.get("format")
  if (format !== "jsonl" && format !== "html") {
    return Response.json({ error: "Invalid export format." }, { status: 400 })
  }
  try {
    const { sessionId } = await context.params
    const content = await getRuntimeSupervisor().exportSession(
      sessionId,
      format
    )
    return new Response(content, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          format === "html"
            ? "text/html; charset=utf-8"
            : "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="pi-session.${format}"`,
      },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
