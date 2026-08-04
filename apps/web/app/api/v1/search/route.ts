import { searchSessions } from "@/lib/catalog"
import { normalizeSessionSearchQuery } from "@/lib/session-search-query"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const query = normalizeSessionSearchQuery(
    new URL(request.url).searchParams.get("q") ?? ""
  )
  return Response.json(
    { query, results: query ? await searchSessions(query) : [] },
    { headers: { "Cache-Control": "no-store" } }
  )
}
