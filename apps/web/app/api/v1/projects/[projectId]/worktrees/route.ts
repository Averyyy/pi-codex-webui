import path from "node:path"
import { z } from "zod"

import { addWorkspaceProject, getProject } from "@/lib/catalog"
import { createProjectWorktree, ProjectGitError } from "@/lib/project-git"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody } from "@/lib/runtime-api"

export const runtime = "nodejs"

const createSchema = z
  .object({
    path: z.string().trim().min(1).max(4096),
    branch: z.string().trim().min(1).max(255),
  })
  .strict()

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/worktrees">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const parsed = createSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) {
    return Response.json(
      { error: "Worktree path and branch are required." },
      { status: 400 }
    )
  }

  const { projectId } = await context.params
  const project = await getProject(projectId)
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  const targetPath = path.resolve(parsed.data.path)
  try {
    await createProjectWorktree(project.path, targetPath, parsed.data.branch)
    return Response.json(await addWorkspaceProject(targetPath), { status: 201 })
  } catch (error) {
    if (error instanceof ProjectGitError) {
      return Response.json({ error: error.message }, { status: 422 })
    }
    throw error
  }
}
