import { requireProject } from "@/lib/resource-api"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import {
  ProjectGitError,
  readProjectGitDiff,
  readProjectGitStatus,
} from "@/lib/project-git"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/git">
) {
  try {
    const { projectId } = await context.params
    const project = await requireProject(projectId)
    const requestedPath = new URL(request.url).searchParams.get("path")
    const result = requestedPath
      ? await readProjectGitDiff(project.path, requestedPath)
      : await readProjectGitStatus(project.path)
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof ProjectGitError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return runtimeErrorResponse(error)
  }
}
