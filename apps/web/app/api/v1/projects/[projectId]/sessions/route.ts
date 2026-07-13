import { z } from "zod"

import { getProject, listProjectSessions } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const createSchema = z.object({
  runtimeProfileId: z.string().min(1).optional(),
})

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
  const project = await getProject(projectId)
  if (!project) {
    return Response.json({ error: "Project not found." }, { status: 404 })
  }
  try {
    const text = await request.text()
    const parsed = createSchema.safeParse(text ? JSON.parse(text) : {})
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid runtime profile selection." },
        { status: 400 }
      )
    }
    return Response.json(
      await getRuntimeSupervisor().createSession(
        projectId,
        parsed.data.runtimeProfileId
      ),
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    )
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      )
    }
    return runtimeErrorResponse(error)
  }
}
