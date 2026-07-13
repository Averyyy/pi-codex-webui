import { mcpServerInputSchema, saveMcpServer } from "@/lib/mcp-config"
import {
  mcpCatalogResponse,
  mcpErrorResponse,
  revisionFrom,
  selectedProjectId,
  validateInputScope,
} from "@/lib/mcp-api"
import { resolveMcpContext } from "@/lib/mcp-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    return await mcpCatalogResponse(selectedProjectId(request))
  } catch (error) {
    return mcpErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const revision = revisionFrom(request)
  if (revision === null) {
    return Response.json(
      { error: "A valid If-Match header is required." },
      { status: 428 }
    )
  }

  try {
    const projectId = selectedProjectId(request)
    await resolveMcpContext(projectId)
    const input = mcpServerInputSchema.parse(await request.json())
    validateInputScope(input, projectId)
    const next = await saveMcpServer(revision, input)
    const server = next.mcp.servers[input.id]!
    await getRuntimeSupervisor().mcpConfigurationChanged(
      server.id,
      server.scope === "project"
        ? (await resolveMcpContext(server.projectId)).projectPath
        : null,
      server.scope === "global"
    )
    return await mcpCatalogResponse(projectId)
  } catch (error) {
    return mcpErrorResponse(error)
  }
}
