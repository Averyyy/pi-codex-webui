export interface CodemodeNestedCallView {
  id: string
  name: string
  args: string
  status: "running" | "ok" | "error" | "cancelled"
  durationMs?: number
  error?: string
  cost?: number
}

interface CodemodeToolDetails {
  calls: CodemodeNestedCallView[]
}

export function codemodeSource(arguments_: Record<string, unknown>) {
  return typeof arguments_.code === "string" ? arguments_.code : undefined
}

export function codemodeCalls(details: unknown): CodemodeNestedCallView[] {
  if (details === undefined) return []
  return (details as CodemodeToolDetails).calls
}

export function mcpToolLabel(name: string, details: unknown) {
  if (!name.startsWith("mcp__") || details === undefined) return name
  const { server, tool } = details as { server: string; tool: string }
  return `${server}/${tool}`
}
