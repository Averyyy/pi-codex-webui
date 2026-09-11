const SHELL_TOOL_NAMES = new Set(["bash", "exec_command", "shell"])
const SHELL_COMMAND_KEYS = ["command", "cmd", "cmd_string"] as const

const labeledResultPattern =
  /(?:^|\s)(?:Command:|Chunk ID:|Wall time:|Original token count:|Output:|Process exited with code\s)/i

export function isShellToolName(name: string) {
  return SHELL_TOOL_NAMES.has(name)
}

export function shellToolCommand(
  name: string,
  args: Record<string, unknown>
) {
  if (!isShellToolName(name)) return ""
  for (const key of SHELL_COMMAND_KEYS) {
    const value = args[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return ""
}

export interface ParsedShellToolResult {
  command?: string
  output: string
  exitCode?: string
  wallTime?: string
}

function capture(raw: string, pattern: RegExp) {
  return raw.match(pattern)?.[1]?.trim() || undefined
}

export function parseShellToolResult(text: string): ParsedShellToolResult {
  const raw = text.replace(/\r\n/g, "\n").trim()
  if (!raw || !labeledResultPattern.test(raw)) return { output: raw }

  const nextLabel =
    "(?=\\s*(?:Chunk ID:|Wall time:|Process exited with code|Original token count:|Output:|$))"

  return {
    command: capture(raw, new RegExp(`Command:\\s*([\\s\\S]*?)${nextLabel}`, "i")),
    output: capture(raw, /Output:\s*([\s\S]*)/i) ?? raw,
    exitCode: capture(raw, /Process exited with code\s+(-?\d+)/i),
    wallTime: capture(
      raw,
      /Wall time:\s*([\s\S]*?)(?=\s*(?:Process exited with code|Original token count:|Output:|$))/i
    ),
  }
}
