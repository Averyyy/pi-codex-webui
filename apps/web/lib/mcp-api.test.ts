import assert from "node:assert/strict"
import test from "node:test"

import { mcpErrorResponse } from "./mcp-api"
import {
  isMcpServiceError,
  McpServiceError,
  mcpServiceErrorResponse,
} from "./mcp-service-error"

test("MCP service failures preserve structured API contracts", async () => {
  for (const [code, status] of [
    ["McpServerNotFound", 404],
    ["McpProjectNotTrusted", 422],
    ["McpConnectionFailed", 422],
  ] as const) {
    const response = mcpServiceErrorResponse(
      new McpServiceError(code, `${code} message`)
    )

    assert.equal(response.status, status)
    assert.deepEqual(response.body, {
      error: `${code} message`,
      code,
    })
  }
})

test("MCP API recognizes branded errors across server bundle boundaries", async () => {
  const foreignBundleError = {
    isPiWebCodexMcpServiceError: true,
    code: "McpServerNotFound",
    message: "MCP server missing does not exist in this scope.",
  } as const

  assert.equal(isMcpServiceError(foreignBundleError), true)
  assert.equal(
    isMcpServiceError({
      name: "McpServiceError",
      code: foreignBundleError.code,
      message: foreignBundleError.message,
    }),
    false
  )
  assert.equal(
    isMcpServiceError({
      ...foreignBundleError,
      code: "UnexpectedMcpFailure",
    }),
    false
  )

  const response = await mcpErrorResponse(foreignBundleError, null)
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), {
    error: foreignBundleError.message,
    code: foreignBundleError.code,
  })
})
