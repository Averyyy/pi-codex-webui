import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { requireProject } from "@/lib/resource-api"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const installSchema = z.object({
  projectId: z.string().min(1),
  source: z.string().trim().min(1),
  scope: z.enum(["global", "project"]),
})

export async function GET(request: Request) {
  try {
    const project = await requireProject(
      new URL(request.url).searchParams.get("projectId")
    )
    const catalog = await getRuntimeSupervisor().resourceCatalog(project.path)
    return Response.json(
      {
        cwd: catalog.cwd,
        projectTrusted: catalog.projectTrusted,
        trustRequired: catalog.trustRequired,
        packages: catalog.packages,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = installSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid package source." },
        { status: 400 }
      )
    }
    const project = await requireProject(parsed.data.projectId)
    return Response.json(
      await getRuntimeSupervisor().installPackage(
        project.path,
        parsed.data.source,
        parsed.data.scope
      )
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
