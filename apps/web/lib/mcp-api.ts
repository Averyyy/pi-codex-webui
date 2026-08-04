import "server-only"

import { ZodError } from "zod"

import { ConfigConflictError } from "./config"
import type { McpServerConfig } from "./config-schema"
import { McpConfigError, type McpServerInput } from "./mcp-config"
import { getMcpService } from "./mcp-service"
import { resolveMcpContext } from "./mcp-settings-data"
import { runtimeErrorResponse } from "./runtime-api"

export function revisionFrom(request: Request) {
  const revision = request.headers
    .get("if-match")
    ?.match(/^"revision-(\d+)"$/)?.[1]
  return revision ? Number(revision) : null
}

export function selectedProjectId(request: Request) {
  return new URL(request.url).searchParams.get("projectId")
}

export async function mcpCatalogResponse(projectId: string | null) {
  const catalog = await getMcpService().catalog(
    await resolveMcpContext(projectId)
  )
  return Response.json(catalog, {
    headers: {
      "Cache-Control": "no-store",
      ETag: `"revision-${catalog.revision}"`,
    },
  })
}

export function validateInputScope(
  input: McpServerInput,
  selectedProject: string | null
) {
  if (input.scope === "project" && input.projectId !== selectedProject) {
    throw new McpConfigError(
      "Project MCP servers must belong to the selected project."
    )
  }
}

export async function restartScope(server: McpServerConfig) {
  if (server.scope === "global") {
    return { cwd: null, global: true }
  }
  const context = await resolveMcpContext(server.projectId)
  return { cwd: context.projectPath, global: false }
}

export async function mcpErrorResponse(
  error: unknown,
  projectId: string | null
) {
  if (error instanceof ConfigConflictError) {
    const current = await getMcpService().catalog(
      await resolveMcpContext(projectId)
    )
    return Response.json(
      {
        error: error.message,
        code: "ConfigConflict",
        current,
      },
      { status: 409 }
    )
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return Response.json(
      {
        error: "Invalid MCP server settings.",
        code: "InvalidMcpInput",
      },
      { status: 400 }
    )
  }
  if (error instanceof McpConfigError) {
    return Response.json(
      { error: error.message, code: "McpConfigError" },
      { status: 400 }
    )
  }
  return runtimeErrorResponse(error)
}
