import "server-only"

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { nativeMcpConfigSchema, type McpConfigFile } from "./mcp-config-schema"

export async function readMcpConfigFile(
  filePath: string
): Promise<McpConfigFile> {
  try {
    const text = await readFile(filePath, "utf8")
    return { path: filePath, text }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { path: filePath, text: null }
    throw error
  }
}

export async function writeMcpConfigFile(
  filePath: string,
  expectedText: string | null,
  text: string
) {
  nativeMcpConfigSchema.parse(JSON.parse(text))
  const current = await readMcpConfigFile(filePath)
  if (current.text !== expectedText) throw new McpConfigConflictError()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${text.trimEnd()}\n`, { mode: 0o600 })
  return readMcpConfigFile(filePath)
}

export class McpConfigConflictError extends Error {
  constructor() {
    super("mcp.json changed. Reload the configuration before saving.")
  }
}
