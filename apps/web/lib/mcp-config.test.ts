import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  McpConfigConflictError,
  readMcpConfigFile,
  writeMcpConfigFile,
} from "./mcp-config"
import { nativeMcpConfigSchema } from "./mcp-config-schema"

test("native MCP files preserve provider auth, tool exposure and unrelated fields", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "webui-mcp-config-"))
  try {
    const file = path.join(directory, "mcp.json")
    const original = {
      autoEnableCodemode: false,
      custom: "retained",
      mcpServers: {
        docs: {
          url: "https://example.com/mcp",
          auth: { provider: "devin" },
          toolExposure: { "read_*": "direct", delete: "hidden" },
        },
      },
    }
    const text = JSON.stringify(original, null, 2)
    await writeFile(file, text)
    const before = await readMcpConfigFile(file)
    const next = nativeMcpConfigSchema.parse(JSON.parse(before.text!))
    next.mcpServers!.docs!.enabled = false
    const saved = await writeMcpConfigFile(
      file,
      before.text,
      JSON.stringify(next, null, 2)
    )
    assert.deepEqual(JSON.parse(saved.text!), {
      ...original,
      mcpServers: { docs: { ...original.mcpServers.docs, enabled: false } },
    })
    await assert.rejects(
      writeMcpConfigFile(file, before.text, text),
      McpConfigConflictError
    )
    assert.equal(await readFile(file, "utf8"), saved.text)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("native MCP files are created only by saving and reject legacy SSE", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "webui-mcp-config-"))
  try {
    const file = path.join(directory, ".pi", "mcp.json")
    assert.equal((await readMcpConfigFile(file)).text, null)
    await assert.rejects(
      writeMcpConfigFile(
        file,
        null,
        '{"mcpServers":{"legacy":{"type":"sse","url":"https://example.com/sse"}}}'
      )
    )
    assert.equal((await readMcpConfigFile(file)).text, null)
    const result = await writeMcpConfigFile(
      file,
      null,
      '{"mcpServers":{"docs":{"enabled":false,"exposure":"hidden"}}}'
    )
    assert.equal(JSON.parse(result.text!).mcpServers.docs.enabled, false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
