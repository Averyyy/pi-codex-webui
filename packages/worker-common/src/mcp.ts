import type {
  AgentToolResult,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import type {
  McpCallResult,
  McpToolDefinition,
} from "@workspace/runtime-protocol"

export type McpToolInvoker = (
  serverId: string,
  toolName: string,
  arguments_: Record<string, unknown>,
  signal: AbortSignal | undefined
) => Promise<McpCallResult>

function contentForAgent(
  result: McpCallResult
): AgentToolResult<unknown>["content"] {
  const content: AgentToolResult<unknown>["content"] = []
  for (const item of result.content) {
    if (typeof item !== "object" || item === null) continue
    if ("type" in item && item.type === "text" && "text" in item) {
      content.push({ type: "text", text: String(item.text) })
    } else if (
      "type" in item &&
      item.type === "image" &&
      "data" in item &&
      "mimeType" in item
    ) {
      content.push({
        type: "image",
        data: String(item.data),
        mimeType: String(item.mimeType),
      })
    } else {
      content.push({ type: "text", text: JSON.stringify(item) })
    }
  }
  if (content.length === 0 && result.structuredContent) {
    content.push({
      type: "text",
      text: JSON.stringify(result.structuredContent),
    })
  }
  if (content.length === 0) {
    content.push({ type: "text", text: "MCP tool completed without content." })
  }
  return content
}

export function createMcpToolDefinitions(
  tools: McpToolDefinition[],
  invoke: McpToolInvoker
): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    label: tool.title ?? `${tool.serverName}: ${tool.toolName}`,
    description:
      tool.description ??
      `Call ${tool.toolName} on the ${tool.serverName} MCP server.`,
    parameters: tool.inputSchema as ToolDefinition["parameters"],
    async execute(_toolCallId, parameters, signal) {
      const result = await invoke(
        tool.serverId,
        tool.toolName,
        parameters as Record<string, unknown>,
        signal
      )
      const content = contentForAgent(result)
      if (result.isError) {
        throw new Error(
          content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n") || `${tool.toolName} returned an MCP error.`
        )
      }
      return {
        content,
        details: {
          serverId: tool.serverId,
          toolName: tool.toolName,
          structuredContent: result.structuredContent,
        },
      }
    },
  }))
}
