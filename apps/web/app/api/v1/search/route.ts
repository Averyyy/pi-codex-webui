import { searchSessions } from "@/lib/catalog"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  return Response.json(
    { query, results: query ? await searchSessions(query) : [] },
    { headers: { "Cache-Control": "no-store" } }
  )
}
