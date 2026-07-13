import "server-only"

import { z } from "zod"

import type { ResourceView } from "@workspace/runtime-protocol"

import { validateLocalMutation } from "@/lib/request-security"
import { requireProject } from "@/lib/resource-api"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

const mutationSchema = z.object({
  projectId: z.string().min(1),
  writeScope: z.enum(["global", "project"]),
  enabled: z.boolean(),
})

export async function getResources(
  request: Request,
  kind?: ResourceView["type"]
) {
  try {
    const project = await requireProject(
      new URL(request.url).searchParams.get("projectId")
    )
    const catalog = await getRuntimeSupervisor().resourceCatalog(project.path)
    return Response.json(
      kind
        ? {
            ...catalog,
            resources: catalog.resources.filter(
              (resource) => resource.type === kind
            ),
          }
        : catalog,
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function patchResource(
  request: Request,
  resourceId: string,
  resourceType: ResourceView["type"]
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = mutationSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid resource mutation." },
        { status: 400 }
      )
    }
    const project = await requireProject(parsed.data.projectId)
    return Response.json(
      await getRuntimeSupervisor().setResourceEnabled(
        project.path,
        resourceId,
        resourceType,
        parsed.data.writeScope,
        parsed.data.enabled
      )
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
