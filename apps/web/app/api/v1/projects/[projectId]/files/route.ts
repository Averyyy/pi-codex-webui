import { requireProject } from "@/lib/resource-api"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import {
  ProjectFileError,
  readProjectEntry,
  readProjectFile,
} from "@/lib/project-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function fileErrorResponse(error: unknown) {
  if (error instanceof ProjectFileError) {
    return Response.json(
      { error: error.message, code: error.code },
      {
        status:
          error.code === "OutsideProject"
            ? 403
            : error.code === "Unavailable"
              ? 410
              : 400,
      }
    )
  }
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return Response.json({ error: "Project path not found." }, { status: 404 })
  }
  return runtimeErrorResponse(error)
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/files">
) {
  try {
    const { projectId } = await context.params
    const project = await requireProject(projectId)
    const url = new URL(request.url)
    const requestedPath = url.searchParams.get("path") ?? ""
    if (url.searchParams.get("download") === "1") {
      const file = await readProjectFile(project.path, requestedPath)
      return new Response(file.contents, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "Content-Type": "application/octet-stream",
        },
      })
    }
    return Response.json(await readProjectEntry(project.path, requestedPath), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return fileErrorResponse(error)
  }
}
