import { listWorkspaceProjects } from "@/lib/catalog"

export const runtime = "nodejs"

export async function GET() {
  return Response.json(
    { projects: await listWorkspaceProjects() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
