import { getProject, listProjectSessions } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

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

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/sessions">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const { projectId } = await context.params
  const sessions = await listProjectSessions(projectId)
  const source = sessions[0]
  if (!source) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  try {
    return Response.json(await getRuntimeSupervisor().newSession(source.id), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
