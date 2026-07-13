import { getProject, listProjectSessions } from "@/lib/catalog"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/sessions">
) {
  const { projectId } = await context.params
  const project = await getProject(projectId)
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  return Response.json(
    { project, sessions: await listProjectSessions(projectId) },
    { headers: { "Cache-Control": "no-store" } }
  )
}
