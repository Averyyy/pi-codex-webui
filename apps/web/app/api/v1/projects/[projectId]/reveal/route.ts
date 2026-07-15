import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { getProject } from "@/lib/catalog"
import { projectFileManager } from "@/lib/project-reveal"
import { validateLocalMutation } from "@/lib/request-security"

export const runtime = "nodejs"

const execFileAsync = promisify(execFile)

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/reveal">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const { projectId } = await context.params
  const project = await getProject(projectId)
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  const fileManager = projectFileManager(process.platform)
  if (!fileManager) {
    return Response.json(
      {
        error: `Opening project folders is not supported on ${process.platform}.`,
      },
      { status: 501 }
    )
  }
  await execFileAsync(fileManager.command, [project.path])
  return Response.json({ projectId })
}
