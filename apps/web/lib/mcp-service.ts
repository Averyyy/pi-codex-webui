import "server-only"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js"
import {
  mcpCallResultSchema,
  type McpCallResult,
  type McpCatalog,
  type McpConnectionStatus,
  type McpServerView,
  type McpToolDefinition,
} from "@workspace/runtime-protocol"

import { loadConfig } from "./config"
import type {
  AppConfig,
  McpServerConfig,
  McpStoredValue,
} from "./config-schema"
import { readSecret } from "./secret-store"
import { getEventHub } from "./event-hub"

interface DiscoveredTool {
  name: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
}

interface McpLogEntry {
  timestamp: string
  level: "info" | "stderr" | "error"
  message: string
}

interface ConnectionState {
  fingerprint: string | null
  status: McpConnectionStatus
  client: Client | null
  tools: DiscoveredTool[]
  lastConnectedAt: string | null
  lastError: string | null
  logs: McpLogEntry[]
}

interface McpContext {
  projectId: string | null
  projectPath: string | null
  projectTrusted: boolean
}

interface McpCallContext extends McpContext {
  signal?: AbortSignal
}

const MAX_LOGS = 100

declare global {
  var piWebCodexMcpService: McpService | undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isSecret(value: McpStoredValue): value is { $secret: string } {
  return typeof value === "object"
}

function namespace(serverId: string, toolName: string) {
  return `mcp__${serverId.replaceAll("-", "_")}__${toolName}`
}

function toolEnabled(server: McpServerConfig, toolName: string) {
  return (
    (server.enabledTools.length === 0 ||
      server.enabledTools.includes(toolName)) &&
    !server.disabledTools.includes(toolName)
  )
}

function relevant(server: McpServerConfig, context: McpContext) {
  return (
    server.scope === "global" ||
    (context.projectId !== null && server.projectId === context.projectId)
  )
}

function executable(server: McpServerConfig, context: McpContext) {
  return server.enabled && (server.scope === "global" || context.projectTrusted)
}

function configuredValues(values: Record<string, McpStoredValue>) {
  return Object.entries(values).map(([key, value]) => ({
    key,
    value: isSecret(value) ? "" : value,
    secret: isSecret(value),
    configured: isSecret(value),
  }))
}

export class McpService {
  private readonly states = new Map<string, ConnectionState>()
  private readonly operations = new Map<string, Promise<void>>()

  private state(serverId: string) {
    let state = this.states.get(serverId)
    if (!state) {
      state = {
        fingerprint: null,
        status: "disconnected",
        client: null,
        tools: [],
        lastConnectedAt: null,
        lastError: null,
        logs: [],
      }
      this.states.set(serverId, state)
    }
    return state
  }

  private log(serverId: string, level: McpLogEntry["level"], message: string) {
    const logs = this.state(serverId).logs
    logs.push({ timestamp: new Date().toISOString(), level, message })
    if (logs.length > MAX_LOGS) logs.shift()
  }

  private publishStatus(serverId: string) {
    const state = this.state(serverId)
    getEventHub().publish({
      type: "mcp.status",
      payload: { serverId, status: state.status },
    })
  }

  private async resolveValues(values: Record<string, McpStoredValue>) {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(values).map(async ([key, value]) => [
          key,
          isSecret(value) ? await readSecret(value.$secret) : value,
        ])
      )
    )
  }

  private fingerprint(server: McpServerConfig, context: McpContext) {
    return JSON.stringify([
      server,
      server.scope === "project" ? context.projectPath : null,
    ])
  }

  private serialize(serverId: string, operation: () => Promise<void>) {
    const previous = this.operations.get(serverId) ?? Promise.resolve()
    const next = previous.then(operation, operation)
    this.operations.set(serverId, next)
    return next.finally(() => {
      if (this.operations.get(serverId) === next) {
        this.operations.delete(serverId)
      }
    })
  }

  private async disconnectNow(
    serverId: string,
    status: McpConnectionStatus = "disconnected"
  ) {
    const state = this.state(serverId)
    const client = state.client
    const changed =
      client !== null ||
      state.status !== status ||
      state.fingerprint !== null ||
      (status !== "disabled" && state.tools.length > 0)
    state.client = null
    state.fingerprint = null
    state.status = status
    if (status !== "disabled") state.tools = []
    if (client) await client.close()
    if (changed) this.publishStatus(serverId)
  }

  async disconnect(
    serverId: string,
    status: McpConnectionStatus = "disconnected"
  ) {
    await this.serialize(serverId, () => this.disconnectNow(serverId, status))
  }

  private async discoverTools(
    serverId: string,
    client: Client,
    timeoutMs: number
  ) {
    const tools: DiscoveredTool[] = []
    let cursor: string | undefined
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, {
        timeout: timeoutMs,
        maxTotalTimeout: timeoutMs,
      })
      tools.push(
        ...page.tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }))
      )
      cursor = page.nextCursor
    } while (cursor)
    const state = this.state(serverId)
    if (state.client !== client) return []
    state.tools = tools
    this.log(serverId, "info", `Discovered ${tools.length} tools.`)
    this.publishStatus(serverId)
    return tools
  }

  private async connectNow(
    server: McpServerConfig,
    context: McpContext,
    force: boolean
  ) {
    const state = this.state(server.id)
    const fingerprint = this.fingerprint(server, context)
    if (
      !force &&
      state.client &&
      state.status === "connected" &&
      state.fingerprint === fingerprint
    ) {
      return
    }

    await this.disconnectNow(server.id)
    state.status = "connecting"
    state.lastError = null
    this.log(server.id, "info", `Connecting with ${server.transport.type}.`)
    this.publishStatus(server.id)

    const client = new Client({ name: "pi-web-codex", version: "0.1.0" })
    client.onclose = () => {
      if (state.client !== client) return
      state.client = null
      state.status = "disconnected"
      this.log(server.id, "info", "Connection closed.")
      this.publishStatus(server.id)
    }
    client.onerror = (error) => {
      if (state.client !== client) return
      state.status = "error"
      state.lastError = error.message
      this.log(server.id, "error", error.message)
      this.publishStatus(server.id)
    }
    client.setNotificationHandler(
      ToolListChangedNotificationSchema,
      async () => {
        if (state.client !== client) return
        await this.discoverTools(server.id, client, server.timeoutMs)
      }
    )

    const transport =
      server.transport.type === "stdio"
        ? new StdioClientTransport({
            command: server.transport.command,
            args: server.transport.args,
            cwd:
              server.transport.cwd ??
              (server.scope === "project"
                ? (context.projectPath ?? undefined)
                : undefined),
            env: {
              ...getDefaultEnvironment(),
              ...(await this.resolveValues(server.env)),
            },
            stderr: "pipe",
          })
        : new StreamableHTTPClientTransport(new URL(server.transport.url), {
            requestInit: {
              headers: await this.resolveValues(server.transport.headers),
            },
          })

    if (transport instanceof StdioClientTransport) {
      transport.stderr?.on("data", (chunk: Buffer) =>
        this.log(server.id, "stderr", chunk.toString("utf8").trimEnd())
      )
    }

    try {
      await client.connect(transport, { timeout: server.timeoutMs })
      state.client = client
      state.fingerprint = fingerprint
      state.status = "connected"
      state.lastConnectedAt = new Date().toISOString()
      await this.discoverTools(server.id, client, server.timeoutMs)
      this.log(server.id, "info", "Connected.")
      this.publishStatus(server.id)
    } catch (error) {
      state.client = null
      state.fingerprint = null
      state.status = "error"
      state.lastError = errorMessage(error)
      this.log(server.id, "error", state.lastError)
      this.publishStatus(server.id)
      await client.close().catch((closeError: unknown) => {
        this.log(
          server.id,
          "error",
          `Close failed: ${errorMessage(closeError)}`
        )
      })
      throw error
    }
  }

  async connect(server: McpServerConfig, context: McpContext, force = false) {
    await this.serialize(server.id, () =>
      this.connectNow(server, context, force)
    )
    return this.state(server.id)
  }

  private async reconcile(config: AppConfig, context: McpContext) {
    const relevantServers = Object.values(config.mcp.servers).filter((server) =>
      relevant(server, context)
    )
    const activeIds = new Set(Object.keys(config.mcp.servers))
    await Promise.all(
      [...this.states.keys()]
        .filter((id) => !activeIds.has(id))
        .map(async (id) => {
          await this.disconnect(id)
          this.states.delete(id)
        })
    )
    await Promise.all(
      relevantServers
        .filter((server) => !executable(server, context))
        .map((server) => this.disconnect(server.id, "disabled"))
    )
    await Promise.allSettled(
      relevantServers
        .filter((server) => executable(server, context))
        .map((server) => this.connect(server, context))
    )
    return relevantServers
  }

  private serverView(server: McpServerConfig): McpServerView {
    const state = this.state(server.id)
    return {
      id: server.id,
      name: server.name,
      scope: server.scope,
      projectId: server.projectId,
      enabled: server.enabled,
      transport:
        server.transport.type === "stdio"
          ? server.transport
          : {
              type: "http",
              url: server.transport.url,
              headers: configuredValues(server.transport.headers),
            },
      env: configuredValues(server.env),
      timeoutMs: server.timeoutMs,
      status: state.status,
      tools: state.tools.map((tool) => ({
        name: tool.name,
        namespacedName: namespace(server.id, tool.name),
        title: tool.title,
        description: tool.description,
        enabled: toolEnabled(server, tool.name),
      })),
      lastConnectedAt: state.lastConnectedAt,
      lastError: state.lastError,
      logs: [...state.logs],
    }
  }

  async catalog(context: McpContext): Promise<McpCatalog> {
    const config = await loadConfig()
    const servers = await this.reconcile(config, context)
    return {
      revision: config.revision,
      projectId: context.projectId,
      projectTrusted: context.projectTrusted,
      servers: servers.map((server) => this.serverView(server)),
    }
  }

  async toolDefinitions(context: McpContext): Promise<McpToolDefinition[]> {
    const config = await loadConfig()
    const servers = await this.reconcile(config, context)
    return servers.flatMap((server) => {
      if (!executable(server, context)) return []
      const state = this.state(server.id)
      if (state.status !== "connected") return []
      return state.tools
        .filter((tool) => toolEnabled(server, tool.name))
        .map((tool) => ({
          serverId: server.id,
          serverName: server.name,
          toolName: tool.name,
          name: namespace(server.id, tool.name),
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }))
    })
  }

  async test(serverId: string, context: McpContext) {
    const config = await loadConfig()
    const server = config.mcp.servers[serverId]
    if (!server || !relevant(server, context)) {
      throw new Error(`MCP server ${serverId} does not exist in this scope.`)
    }
    if (server.scope === "project" && !context.projectTrusted) {
      throw new Error("The project must be trusted before testing this server.")
    }
    const startedAt = performance.now()
    await this.connect(server, context, true)
    return {
      latencyMs: Math.round(performance.now() - startedAt),
      toolCount: this.state(serverId).tools.length,
    }
  }

  async callTool(
    serverId: string,
    toolName: string,
    arguments_: Record<string, unknown>,
    context: McpCallContext
  ): Promise<McpCallResult> {
    const config = await loadConfig()
    const server = config.mcp.servers[serverId]
    if (!server || !relevant(server, context) || !executable(server, context)) {
      throw new Error(
        `MCP server ${serverId} is not available to this runtime.`
      )
    }
    if (!toolEnabled(server, toolName)) {
      throw new Error(`MCP tool ${toolName} is disabled.`)
    }
    await this.connect(server, context)
    const state = this.state(serverId)
    if (!state.client || !state.tools.some((tool) => tool.name === toolName)) {
      throw new Error(`MCP tool ${toolName} was not discovered on ${serverId}.`)
    }

    this.log(serverId, "info", `Calling ${toolName}.`)
    try {
      const result = mcpCallResultSchema.parse(
        await state.client.callTool(
          { name: toolName, arguments: arguments_ },
          undefined,
          {
            signal: context.signal,
            timeout: server.timeoutMs,
            maxTotalTimeout: server.timeoutMs,
          }
        )
      )
      this.log(serverId, "info", `Completed ${toolName}.`)
      return result
    } catch (error) {
      state.lastError = errorMessage(error)
      this.log(serverId, "error", `${toolName}: ${state.lastError}`)
      this.publishStatus(serverId)
      throw error
    }
  }

  async configurationChanged(serverId: string) {
    await this.disconnect(serverId)
  }
}

export function getMcpService() {
  globalThis.piWebCodexMcpService ??= new McpService()
  return globalThis.piWebCodexMcpService
}
