import { getProject } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { syncPiProjectSessions } from "@/lib/session-index"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/sessions/refresh">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const { projectId } = await context.params
  if (!(await getProject(projectId))) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }

  try {
    const result = await syncPiProjectSessions(projectId)
    return Response.json(
      { projectId, failures: result.failures },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return Response.json(
      {
        error: `Project conversation refresh failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    )
  }
}
