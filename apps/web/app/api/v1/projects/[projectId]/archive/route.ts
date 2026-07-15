import { getProject, listProjectSessions } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/archive">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const { projectId } = await context.params
  if (!(await getProject(projectId))) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  const sessions = await listProjectSessions(projectId)
  const supervisor = getRuntimeSupervisor()
  for (const session of sessions) {
    await supervisor.archiveSession(session.id)
  }
  return Response.json({ projectId, archived: sessions.length })
}
