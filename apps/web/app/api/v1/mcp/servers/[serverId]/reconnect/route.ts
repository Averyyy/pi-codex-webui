import { mcpErrorResponse, selectedProjectId } from "@/lib/mcp-api"
import { getMcpService } from "@/lib/mcp-service"
import { resolveMcpContext } from "@/lib/mcp-settings-data"
import { validateLocalMutation } from "@/lib/request-security"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  route: RouteContext<"/api/v1/mcp/servers/[serverId]/reconnect">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const context = await resolveMcpContext(selectedProjectId(request))
    const { serverId } = await route.params
    await getMcpService().test(serverId, context)
    return Response.json(await getMcpService().catalog(context))
  } catch (error) {
    return mcpErrorResponse(error)
  }
}
