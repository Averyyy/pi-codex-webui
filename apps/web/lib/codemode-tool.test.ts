import assert from "node:assert/strict"
import test from "node:test"

import { codemodeCalls, codemodeSource, mcpToolLabel } from "./codemode-tool"

test("codemode source stays readable as the raw JavaScript argument", () => {
  const code =
    "const files = await tools.find({ pattern: '*.ts' })\ntext(files)"
  assert.equal(codemodeSource({ code }), code)
  assert.equal(codemodeSource({}), undefined)
})

test("codemode result details retain nested tool status, arguments, errors, and duration", () => {
  assert.deepEqual(
    codemodeCalls({
      calls: [
        {
          id: "codemode-1/1",
          name: "mcp__docs__search",
          args: '{"query":"pi"}',
          status: "ok",
          durationMs: 83,
        },
        {
          id: "codemode-1/2",
          name: "read",
          args: "{}",
          status: "error",
          error: "Not found",
        },
      ],
    }),
    [
      {
        id: "codemode-1/1",
        name: "mcp__docs__search",
        args: '{"query":"pi"}',
        status: "ok",
        durationMs: 83,
      },
      {
        id: "codemode-1/2",
        name: "read",
        args: "{}",
        status: "error",
        error: "Not found",
      },
    ]
  )
  assert.deepEqual(codemodeCalls(undefined), [])
})

test("native MCP details provide a readable server and tool name", () => {
  assert.equal(
    mcpToolLabel("mcp__github__search_issues", {
      server: "github",
      tool: "search_issues",
    }),
    "github/search_issues"
  )
  assert.equal(mcpToolLabel("custom_tool", undefined), "custom_tool")
  assert.equal(
    mcpToolLabel("custom_tool", { server: "extension", tool: "render" }),
    "custom_tool"
  )
})
