export type McpArgumentError = "invalid-json" | "not-string-array" | "limit"

export function parseMcpArguments(
  transport: "stdio" | "http",
  value: string
):
  | { arguments: string[]; error: null }
  | { arguments: null; error: McpArgumentError } {
  if (transport === "http") return { arguments: [], error: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return { arguments: null, error: "invalid-json" }
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string")
  ) {
    return { arguments: null, error: "not-string-array" }
  }
  if (parsed.length > 200 || parsed.some((item) => item.length > 8_192)) {
    return { arguments: null, error: "limit" }
  }
  return { arguments: parsed, error: null }
}
