import { z } from "zod"

import { loadConfig } from "@/lib/config"
import {
  deleteMcpServer,
  mcpServerInputSchema,
  saveMcpServer,
  setMcpServerEnabled,
  setMcpToolEnabled,
} from "@/lib/mcp-config"
import {
  mcpCatalogResponse,
  mcpErrorResponse,
  restartScope,
  revisionFrom,
  selectedProjectId,
  validateInputScope,
} from "@/lib/mcp-api"
import { resolveMcpContext } from "@/lib/mcp-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const updateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("configuration"), server: mcpServerInputSchema }),
  z.object({ type: z.literal("enabled"), enabled: z.boolean() }),
  z.object({
    type: z.literal("tool"),
    toolName: z.string().min(1).max(128),
    enabled: z.boolean(),
  }),
])

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/mcp/servers/[serverId]">
) {
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
    const { serverId } = await context.params
    const current = await loadConfig()
    const previous = current.mcp.servers[serverId]
    if (!previous) {
      return Response.json({ error: "MCP server not found." }, { status: 404 })
    }
    const update = updateSchema.parse(await request.json())
    let next
    if (update.type === "configuration") {
      validateInputScope(update.server, projectId)
      next = await saveMcpServer(revision, update.server, serverId)
    } else if (update.type === "enabled") {
      next = await setMcpServerEnabled(revision, serverId, update.enabled)
    } else {
      next = await setMcpToolEnabled(
        revision,
        serverId,
        update.toolName,
        update.enabled
      )
    }
    const server = next.mcp.servers[serverId]!
    const scope =
      previous.scope !== server.scope || previous.projectId !== server.projectId
        ? { cwd: null, global: true }
        : await restartScope(server)
    await getRuntimeSupervisor().mcpConfigurationChanged(
      serverId,
      scope.cwd,
      scope.global
    )
    return await mcpCatalogResponse(projectId)
  } catch (error) {
    return mcpErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/mcp/servers/[serverId]">
) {
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
    const { serverId } = await context.params
    const current = await loadConfig()
    const server = current.mcp.servers[serverId]
    if (!server) {
      return Response.json({ error: "MCP server not found." }, { status: 404 })
    }
    const scope = await restartScope(server)
    await deleteMcpServer(revision, serverId)
    await getRuntimeSupervisor().mcpConfigurationChanged(
      serverId,
      scope.cwd,
      scope.global
    )
    return await mcpCatalogResponse(projectId)
  } catch (error) {
    return mcpErrorResponse(error)
  }
}
