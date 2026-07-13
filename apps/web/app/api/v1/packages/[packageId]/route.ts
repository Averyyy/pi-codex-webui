import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { requireProject } from "@/lib/resource-api"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const projectSchema = z.string().min(1)

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/packages/[packageId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const projectId = projectSchema.safeParse(
      new URL(request.url).searchParams.get("projectId")
    )
    if (!projectId.success) {
      return Response.json({ error: "Project is required." }, { status: 400 })
    }
    const project = await requireProject(projectId.data)
    const { packageId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().mutatePackage(
        project.path,
        packageId,
        "remove"
      )
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
