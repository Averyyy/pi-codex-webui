import { getEventHub } from "@/lib/event-hub"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const replayAfter =
    request.headers.get("last-event-id") ?? url.searchParams.get("after")
  const sessionIds =
    url.searchParams.get("scope") === "all"
      ? null
      : url.searchParams.getAll("sessionId")
  return new Response(
    getEventHub().stream(
      sessionIds,
      replayAfter,
      request.signal,
      url.searchParams.get("inspect") === "1" ? "protocol.event" : undefined
    ),
    {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
      },
    }
  )
}
