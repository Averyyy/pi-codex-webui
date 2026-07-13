import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { requireProject } from "@/lib/resource-api"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const trustSchema = z.object({ trusted: z.boolean() })

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/trust">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = trustSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid trust decision." },
        { status: 400 }
      )
    }
    const { projectId } = await context.params
    const project = await requireProject(projectId)
    return Response.json(
      await getRuntimeSupervisor().setProjectTrust(
        projectId,
        project.path,
        parsed.data.trusted
      )
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
