import assert from "node:assert/strict"
import test from "node:test"

import { parseMcpArguments } from "./mcp-form-validation"

test("HTTP MCP forms ignore the hidden stdio arguments field", () => {
  assert.deepEqual(parseMcpArguments("http", "not json"), {
    arguments: [],
    error: null,
  })
})

test("stdio MCP arguments require a bounded string array", () => {
  assert.deepEqual(parseMcpArguments("stdio", "not json"), {
    arguments: null,
    error: "invalid-json",
  })
  assert.deepEqual(parseMcpArguments("stdio", '["ok", 1]'), {
    arguments: null,
    error: "not-string-array",
  })
  assert.deepEqual(
    parseMcpArguments("stdio", JSON.stringify(Array(201).fill("arg"))),
    { arguments: null, error: "limit" }
  )
  assert.deepEqual(parseMcpArguments("stdio", '["--flag"]'), {
    arguments: ["--flag"],
    error: null,
  })
})
