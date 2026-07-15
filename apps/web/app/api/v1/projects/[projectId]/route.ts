import { z } from "zod"

import {
  listProjectSessions,
  removeWorkspaceProject,
  renameWorkspaceProject,
  setProjectPinned,
} from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const updateSchema = z.union([
  z.object({ name: z.string().trim().min(1).max(200) }).strict(),
  z.object({ pinned: z.boolean() }).strict(),
])

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const parsed = updateSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) {
    return Response.json({ error: "Invalid project update." }, { status: 400 })
  }

  const { projectId } = await context.params
  const updated =
    "name" in parsed.data
      ? await renameWorkspaceProject(projectId, parsed.data.name)
      : await setProjectPinned(projectId, parsed.data.pinned)
  if (!updated) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  return Response.json({ projectId })
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const { projectId } = await context.params
  const sessions = await listProjectSessions(projectId)
  const supervisor = getRuntimeSupervisor()
  for (const session of sessions) {
    await supervisor.stop(session.id)
  }
  if (!(await removeWorkspaceProject(projectId))) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  return Response.json({ projectId })
}
