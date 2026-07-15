import { z } from "zod"

import { addWorkspaceProject, listWorkspaceProjects } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody } from "@/lib/runtime-api"

export const runtime = "nodejs"

const createSchema = z.object({ path: z.string().trim().min(1).max(4096) })

export async function GET() {
  return Response.json(
    { projects: await listWorkspaceProjects() },
    { headers: { "Cache-Control": "no-store" } }
  )
}

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const parsed = createSchema.safeParse(await readJsonBody(request))
  if (!parsed.success) {
    return Response.json({ error: "Invalid project path." }, { status: 400 })
  }
  try {
    return Response.json(await addWorkspaceProject(parsed.data.path), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return Response.json(
        { error: "Project directory does not exist." },
        { status: 400 }
      )
    }
    throw error
  }
}
