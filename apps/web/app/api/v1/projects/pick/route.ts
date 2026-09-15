import { z } from "zod"
import { listProjectDirectories } from "@/lib/project-directory-picker"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody } from "@/lib/runtime-api"

export const runtime = "nodejs"
const schema = z.object({ path: z.string().min(1).max(4096).optional() })

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError)
    return Response.json({ error: securityError }, { status: 403 })
  try {
    const parsed = schema.safeParse(await readJsonBody(request))
    if (!parsed.success)
      return Response.json(
        { error: "Invalid directory path." },
        { status: 400 }
      )
    return Response.json(await listProjectDirectories(parsed.data.path), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    )
  }
}
