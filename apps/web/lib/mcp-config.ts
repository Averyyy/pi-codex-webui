import "server-only"

import { z } from "zod"

import { ConfigConflictError, loadConfig, patchConfig } from "./config"
import {
  mcpServerIdSchema,
  type McpServerConfig,
  type McpStoredValue,
} from "./config-schema"
import { removeSecret, writeSecret } from "./secret-store"

const configuredValueInputSchema = z.object({
  key: z.string().trim().min(1).max(256),
  value: z.string().max(8_192),
  secret: z.boolean(),
  configured: z.boolean(),
})

function uniqueKeys(
  values: z.infer<typeof configuredValueInputSchema>[],
  context: z.RefinementCtx
) {
  const keys = values.map((value) => value.key)
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", message: "Keys must be unique." })
  }
}

const configuredValuesInputSchema = z
  .array(configuredValueInputSchema)
  .max(200)
  .superRefine(uniqueKeys)

export const mcpServerInputSchema = z
  .object({
    id: mcpServerIdSchema,
    name: z.string().trim().min(1).max(80),
    scope: z.enum(["global", "project"]),
    projectId: z.string().min(1).nullable(),
    enabled: z.boolean(),
    transport: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("stdio"),
        command: z.string().trim().min(1).max(2_048),
        args: z.array(z.string().max(8_192)).max(200),
        cwd: z.string().max(2_048).nullable(),
      }),
      z.object({
        type: z.literal("http"),
        url: z.url({ protocol: /^https?$/ }).max(2_048),
        headers: configuredValuesInputSchema,
      }),
    ]),
    env: configuredValuesInputSchema,
    timeoutMs: z.number().int().min(1_000).max(600_000),
  })
  .superRefine((server, context) => {
    if (server.scope === "project" && !server.projectId) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Project-scoped MCP servers require a project ID.",
      })
    }
    if (server.scope === "global" && server.projectId !== null) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Global MCP servers cannot have a project ID.",
      })
    }
    if (server.transport.type === "http") {
      const url = new URL(server.transport.url)
      if (url.username || url.password) {
        context.addIssue({
          code: "custom",
          path: ["transport", "url"],
          message: "HTTP transport URLs cannot contain credentials.",
        })
      }
    }
  })

export type McpServerInput = z.infer<typeof mcpServerInputSchema>

export class McpConfigError extends Error {}

function isSecret(value: McpStoredValue): value is { $secret: string } {
  return typeof value === "object"
}

function secretReferences(server: McpServerConfig) {
  const values = [
    ...Object.values(server.env),
    ...(server.transport.type === "http"
      ? Object.values(server.transport.headers)
      : []),
  ]
  return new Set(values.filter(isSecret).map((reference) => reference.$secret))
}

async function materializeValues(
  inputs: McpServerInput["env"],
  previous: Record<string, McpStoredValue>,
  created: string[]
) {
  const values: Record<string, McpStoredValue> = {}
  for (const input of inputs) {
    if (!input.secret) {
      values[input.key] = input.value
      continue
    }
    if (input.value) {
      const reference = await writeSecret(input.value)
      created.push(reference)
      values[input.key] = { $secret: reference }
      continue
    }
    const prior = previous[input.key]
    if (!input.configured || !prior || !isSecret(prior)) {
      throw new McpConfigError(`Secret value ${input.key} requires a value.`)
    }
    values[input.key] = prior
  }
  return values
}

async function materializeServer(
  input: McpServerInput,
  previous: McpServerConfig | undefined,
  created: string[]
): Promise<McpServerConfig> {
  const environment = await materializeValues(
    input.env,
    previous?.env ?? {},
    created
  )
  const transport =
    input.transport.type === "stdio"
      ? input.transport
      : {
          type: "http" as const,
          url: input.transport.url,
          headers: await materializeValues(
            input.transport.headers,
            previous?.transport.type === "http"
              ? previous.transport.headers
              : {},
            created
          ),
        }
  return {
    id: input.id,
    name: input.name,
    scope: input.scope,
    projectId: input.projectId,
    enabled: input.enabled,
    transport,
    env: environment,
    timeoutMs: input.timeoutMs,
    enabledTools: previous?.enabledTools ?? [],
    disabledTools: previous?.disabledTools ?? [],
  }
}

async function removeUnusedSecrets(
  previous: McpServerConfig | undefined,
  next: McpServerConfig | undefined
) {
  if (!previous) return
  const retained = next ? secretReferences(next) : new Set<string>()
  await Promise.all(
    [...secretReferences(previous)]
      .filter((reference) => !retained.has(reference))
      .map(removeSecret)
  )
}

export async function saveMcpServer(
  expectedRevision: number,
  input: McpServerInput,
  existingId?: string
) {
  const current = await loadConfig()
  if (current.revision !== expectedRevision) {
    throw new ConfigConflictError(current.revision)
  }
  const previous = existingId ? current.mcp.servers[existingId] : undefined
  if (existingId && !previous) {
    throw new McpConfigError(`MCP server ${existingId} does not exist.`)
  }
  if (existingId && input.id !== existingId) {
    throw new McpConfigError("MCP server namespaces cannot be changed.")
  }
  if (!existingId && current.mcp.servers[input.id]) {
    throw new McpConfigError(`MCP server ${input.id} already exists.`)
  }

  const created: string[] = []
  let committed = false
  try {
    const server = await materializeServer(input, previous, created)
    const next = await patchConfig(expectedRevision, {
      mcp: {
        servers: { ...current.mcp.servers, [server.id]: server },
      },
    })
    committed = true
    await removeUnusedSecrets(previous, server)
    return next
  } finally {
    if (!committed) await Promise.all(created.map(removeSecret))
  }
}

export async function deleteMcpServer(
  expectedRevision: number,
  serverId: string
) {
  const current = await loadConfig()
  const server = current.mcp.servers[serverId]
  if (!server)
    throw new McpConfigError(`MCP server ${serverId} does not exist.`)
  const servers = { ...current.mcp.servers }
  delete servers[serverId]
  const next = await patchConfig(expectedRevision, { mcp: { servers } })
  await removeUnusedSecrets(server, undefined)
  return next
}

export async function setMcpServerEnabled(
  expectedRevision: number,
  serverId: string,
  enabled: boolean
) {
  const current = await loadConfig()
  const server = current.mcp.servers[serverId]
  if (!server)
    throw new McpConfigError(`MCP server ${serverId} does not exist.`)
  return patchConfig(expectedRevision, {
    mcp: {
      servers: {
        ...current.mcp.servers,
        [serverId]: { ...server, enabled },
      },
    },
  })
}

export async function setMcpToolEnabled(
  expectedRevision: number,
  serverId: string,
  toolName: string,
  enabled: boolean
) {
  const current = await loadConfig()
  const server = current.mcp.servers[serverId]
  if (!server)
    throw new McpConfigError(`MCP server ${serverId} does not exist.`)
  const enabledTools = new Set(server.enabledTools)
  const disabledTools = new Set(server.disabledTools)
  if (enabled) {
    disabledTools.delete(toolName)
    if (enabledTools.size > 0) enabledTools.add(toolName)
  } else {
    disabledTools.add(toolName)
  }
  return patchConfig(expectedRevision, {
    mcp: {
      servers: {
        ...current.mcp.servers,
        [serverId]: {
          ...server,
          enabledTools: [...enabledTools],
          disabledTools: [...disabledTools],
        },
      },
    },
  })
}
