import { requireProject } from "@/lib/resource-api"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { readProjectGitStatus } from "@/lib/project-git"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/git">
) {
  try {
    const { projectId } = await context.params
    const project = await requireProject(projectId)
    return Response.json(await readProjectGitStatus(project.path), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
