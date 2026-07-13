import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { requireProject } from "@/lib/resource-api"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const updateSchema = z.object({ projectId: z.string().min(1) })

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/packages/[packageId]/update">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = updateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json({ error: "Project is required." }, { status: 400 })
    }
    const project = await requireProject(parsed.data.projectId)
    const { packageId } = await context.params
    return Response.json(
      await getRuntimeSupervisor().mutatePackage(
        project.path,
        packageId,
        "update"
      )
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
