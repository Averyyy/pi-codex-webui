import { listSessionPage } from "@/lib/catalog"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import {
  parseSessionPageQuery,
  type SessionPageQuery,
} from "@/lib/session-pagination"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  let query: SessionPageQuery
  try {
    query = parseSessionPageQuery(
      Object.fromEntries(params) as SessionPageQuery
    )
  } catch {
    return Response.json(
      { error: "Invalid session pagination parameters." },
      { status: 400 }
    )
  }
  const page = await listSessionPage(query)
  const supervisor = getRuntimeSupervisor()
  return Response.json(
    {
      ...page,
      sessions: page.sessions.map((session) => ({
        ...session,
        isRunning: supervisor.state(session.id).status === "busy",
      })),
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  )
}
