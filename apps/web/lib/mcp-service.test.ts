import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

import { patchConfig } from "./config"
import { setMcpToolEnabled } from "./mcp-config"
import { McpService } from "./mcp-service"
import { writeSecret } from "./secret-store"

const context = {
  projectId: null,
  projectPath: null,
  projectTrusted: false,
}

function stdioServerSource() {
  const mcpUrl = import.meta.resolve("@modelcontextprotocol/sdk/server/mcp.js")
  const transportUrl = import.meta
    .resolve("@modelcontextprotocol/sdk/server/stdio.js")
  const zodUrl = import.meta.resolve("zod")
  return `
import { McpServer } from ${JSON.stringify(mcpUrl)};
import { StdioServerTransport } from ${JSON.stringify(transportUrl)};
import { z } from ${JSON.stringify(zodUrl)};
const server = new McpServer({ name: "stdio-fixture", version: "1.0.0" });
server.registerTool("echo", {
  title: "Echo",
  description: "Echo a value with the configured secret.",
  inputSchema: { value: z.string() },
}, async ({ value }) => ({
  content: [{ type: "text", text: process.env.MCP_TEST_SECRET + ":" + value }],
}));
await server.connect(new StdioServerTransport());
`
}

function createHttpFixture(expectedAuthorization: string) {
  const app = createMcpExpressApp()
  const transports = new Map<string, StreamableHTTPServerTransport>()

  function server() {
    const instance = new McpServer({ name: "http-fixture", version: "1.0.0" })
    instance.registerTool(
      "greet",
      {
        title: "Greeting",
        description: "Return a greeting.",
        inputSchema: { name: z.string() },
      },
      async ({ name }) => ({
        content: [{ type: "text", text: `Hello, ${name}!` }],
      })
    )
    return instance
  }

  app.post("/mcp", async (request, response) => {
    if (request.headers.authorization !== expectedAuthorization) {
      response.status(401).send("Unauthorized")
      return
    }
    const sessionId = request.headers["mcp-session-id"] as string | undefined
    let transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport && !sessionId && isInitializeRequest(request.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized(id) {
          transports.set(id, transport!)
        },
      })
      transport.onclose = () => {
        if (transport?.sessionId) transports.delete(transport.sessionId)
      }
      await server().connect(transport)
    }
    if (!transport) {
      response.status(400).send("Invalid session")
      return
    }
    await transport.handleRequest(request, response, request.body)
  })
  app.get("/mcp", async (request, response) => {
    const sessionId = request.headers["mcp-session-id"] as string | undefined
    const transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) {
      response.status(400).send("Invalid session")
      return
    }
    await transport.handleRequest(request, response)
  })
  app.delete("/mcp", async (request, response) => {
    const sessionId = request.headers["mcp-session-id"] as string | undefined
    const transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) {
      response.status(400).send("Invalid session")
      return
    }
    await transport.handleRequest(request, response)
  })

  return { app, transports }
}

test("MCP service discovers and calls stdio and HTTP tools without exposing secrets", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-web-mcp-"))
  const previousConfigDir = process.env.PI_WEB_CODEX_CONFIG_DIR
  process.env.PI_WEB_CODEX_CONFIG_DIR = directory

  const http = createHttpFixture("Bearer http-secret")
  const listener = http.app.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => listener.once("listening", resolve))
  const address = listener.address() as AddressInfo
  const [stdioSecret, httpSecret] = await Promise.all([
    writeSecret("stdio-secret"),
    writeSecret("Bearer http-secret"),
  ])

  const service = new McpService()
  t.after(async () => {
    await Promise.all([
      service.disconnect("stdio-fixture"),
      service.disconnect("http-fixture"),
    ])
    await Promise.all([...http.transports.values()].map((item) => item.close()))
    await new Promise<void>((resolve, reject) =>
      listener.close((error?: Error) => (error ? reject(error) : resolve()))
    )
    if (previousConfigDir === undefined) {
      delete process.env.PI_WEB_CODEX_CONFIG_DIR
    } else {
      process.env.PI_WEB_CODEX_CONFIG_DIR = previousConfigDir
    }
    await rm(directory, { recursive: true, force: true })
  })

  await patchConfig(0, {
    mcp: {
      servers: {
        "stdio-fixture": {
          id: "stdio-fixture",
          name: "stdio fixture",
          scope: "global",
          projectId: null,
          enabled: true,
          transport: {
            type: "stdio",
            command: process.execPath,
            args: ["--input-type=module", "-e", stdioServerSource()],
            cwd: null,
          },
          env: { MCP_TEST_SECRET: { $secret: stdioSecret } },
          timeoutMs: 10_000,
          enabledTools: [],
          disabledTools: [],
        },
        "http-fixture": {
          id: "http-fixture",
          name: "HTTP fixture",
          scope: "global",
          projectId: null,
          enabled: true,
          transport: {
            type: "http",
            url: `http://127.0.0.1:${address.port}/mcp`,
            headers: { Authorization: { $secret: httpSecret } },
          },
          env: {},
          timeoutMs: 10_000,
          enabledTools: [],
          disabledTools: [],
        },
      },
    },
  })

  const [stdioTest, httpTest] = await Promise.all([
    service.test("stdio-fixture", context),
    service.test("http-fixture", context),
  ])
  assert.equal(stdioTest.toolCount, 1)
  assert.equal(httpTest.toolCount, 1)

  const [echo, greeting] = await Promise.all([
    service.callTool("stdio-fixture", "echo", { value: "ok" }, context),
    service.callTool("http-fixture", "greet", { name: "Codex" }, context),
  ])
  assert.deepEqual(echo.content, [{ type: "text", text: "stdio-secret:ok" }])
  assert.deepEqual(greeting.content, [{ type: "text", text: "Hello, Codex!" }])

  const catalog = await service.catalog(context)
  assert.deepEqual(
    catalog.servers.map((server) => [server.id, server.status]),
    [
      ["stdio-fixture", "connected"],
      ["http-fixture", "connected"],
    ]
  )
  assert.equal(JSON.stringify(catalog).includes("stdio-secret"), false)
  assert.equal(JSON.stringify(catalog).includes("http-secret"), false)
  assert.deepEqual(
    (await service.toolDefinitions(context)).map((tool) => tool.name),
    ["mcp__stdio_fixture__echo", "mcp__http_fixture__greet"]
  )

  await setMcpToolEnabled(1, "stdio-fixture", "echo", false)
  await assert.rejects(
    () => service.callTool("stdio-fixture", "echo", {}, context),
    /disabled/
  )
})
