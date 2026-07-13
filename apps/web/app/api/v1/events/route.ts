import { getEventHub } from "@/lib/event-hub"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  return new Response(
    getEventHub().stream(
      url.searchParams.getAll("sessionId"),
      request.headers.get("last-event-id"),
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
