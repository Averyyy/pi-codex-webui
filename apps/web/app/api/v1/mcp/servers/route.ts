import { z, ZodError } from "zod"

import { McpConfigConflictError, writeMcpConfigFile } from "@/lib/mcp-config"
import { readMcpSettings, resolveMcpContext } from "@/lib/mcp-settings-data"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { validateLocalMutation } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { assertUpdateAllowed } from "@/lib/update-maintenance"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    return Response.json(
      await readMcpSettings(new URL(request.url).searchParams.get("projectId")),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

const saveSchema = z.object({
  scope: z.enum(["global", "project"]),
  expectedText: z.string().nullable(),
  text: z.string(),
})

export async function PUT(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError)
    return Response.json({ error: securityError }, { status: 403 })
  const projectId = new URL(request.url).searchParams.get("projectId")
  try {
    assertUpdateAllowed()
    const input = saveSchema.parse(await request.json())
    const current = await readMcpSettings(projectId)
    const file = current.files[input.scope]
    if (!file)
      return Response.json(
        { error: "Select a project to edit project MCP settings." },
        { status: 400 }
      )
    await writeMcpConfigFile(file.path, input.expectedText, input.text)
    const context = await resolveMcpContext(projectId)
    await getRuntimeSupervisor().mcpConfigurationChanged(
      "mcp.json",
      context.projectPath,
      input.scope === "global"
    )
    return Response.json(await readMcpSettings(projectId))
  } catch (error) {
    if (error instanceof McpConfigConflictError)
      return Response.json({ error: error.message }, { status: 409 })
    if (error instanceof ZodError || error instanceof SyntaxError)
      return Response.json({ error: error.message }, { status: 400 })
    return runtimeErrorResponse(error)
  }
}
