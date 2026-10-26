import assert from "node:assert/strict"
import { fork, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  workerToHostMessageSchema,
  type HostToWorkerMessage,
  type WorkerToHostMessage,
} from "@workspace/runtime-protocol"

const root = path.resolve(import.meta.dirname, "../../..")

function waitFor(
  child: ChildProcess,
  match: (message: WorkerToHostMessage) => boolean
) {
  return new Promise<WorkerToHostMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off("message", listener)
      reject(new Error("Native MCP worker timed out."))
    }, 30_000)
    const listener = (raw: unknown) => {
      const message = workerToHostMessageSchema.parse(raw)
      if (message.type === "runtime.fatal" || match(message)) {
        clearTimeout(timeout)
        child.off("message", listener)
        if (message.type === "runtime.fatal")
          reject(new Error(message.error.message))
        else resolve(message)
      }
    }
    child.on("message", listener)
  })
}

async function request(child: ChildProcess, message: HostToWorkerMessage) {
  const response = waitFor(
    child,
    (next) =>
      (next.type === "runtime.response" || next.type === "runtime.ready") &&
      next.requestId === message.requestId
  )
  child.send(message)
  const result = await response
  if (result.type === "runtime.response" && !result.success)
    throw new Error(result.error!.message)
  return result
}

for (const kind of ["pi", "pi-client"] as const) {
  test(`${kind} loads native MCP, reports status, reconnects and executes tools through Codemode`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "webui-native-mcp-"))
    const cwd = path.join(directory, "project")
    const agentDir = path.join(directory, "agent")
    await Promise.all([mkdir(cwd), mkdir(agentDir)])
    const toolArguments: unknown[] = []
    let listed!: () => void
    const toolsListed = new Promise<void>((resolve) => {
      listed = resolve
    })
    const mcp = createServer(async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405)
        res.end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      const message = JSON.parse(Buffer.concat(chunks).toString()) as {
        id?: number
        method: string
        params?: { arguments?: unknown }
      }
      if (message.id === undefined) {
        res.writeHead(202)
        res.end()
        return
      }
      let result: unknown
      if (message.method === "initialize")
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "Fixture", version: "1.0" },
        }
      else if (message.method === "tools/list") {
        result = {
          tools: [
            {
              name: "echo",
              description: "Echo text",
              inputSchema: {
                type: "object",
                properties: { value: { type: "string" } },
              },
            },
          ],
        }
        listed()
      } else if (message.method === "tools/call") {
        toolArguments.push(message.params?.arguments)
        result = { content: [{ type: "text", text: "fixture result" }] }
      } else result = {}
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }))
    })
    await new Promise<void>((resolve) => mcp.listen(0, "127.0.0.1", resolve))
    const address = mcp.address()
    assert.ok(address && typeof address === "object")
    await writeFile(
      path.join(agentDir, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          fixture: { url: `http://127.0.0.1:${address.port}/mcp` },
        },
      })
    )
    let streams = 0
    const requests: string[] = []
    const code =
      'text(await tools.mcp__fixture__echo({ value: "from script" }))'
    const piServer = createServer(async (req, res) => {
      requests.push(`${req.method} ${req.url}`)
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : {}
      const model = {
        id: "fixture-model",
        name: "Fixture model",
        api: "openai-completions",
        provider: "fixture",
        baseUrl: `http://${req.headers.host}/v1`,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 16000,
        maxTokens: 2000,
      }
      if (req.url === "/api/models") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            models: [model],
            available: [model],
            providers: [
              { id: "fixture", fetchDeferred: false, cancelDeferred: false },
            ],
          })
        )
        return
      }
      if (req.url === "/api/session/init") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            sessionId: body.sessionId,
            staticContextHash: "fixture",
            treeHash: "fixture",
            messageCount: 0,
            entryCount: 0,
            leafId: null,
            revision: 0,
          })
        )
        return
      }
      const abort = /^\/api\/session\/([^/]+)\/runs\/([^/]+)\/abort$/.exec(
        req.url ?? ""
      )
      if (req.method === "POST" && abort) {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            sessionId: decodeURIComponent(abort[1]!),
            runId: decodeURIComponent(abort[2]!),
            status: "completed",
          })
        )
        return
      }
      if (
        req.method !== "POST" ||
        (req.url !== "/api/stream" && req.url !== "/v1/chat/completions")
      ) {
        res.writeHead(404, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Not found" }))
        return
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" })
      const first = streams++ === 0
      if (req.url === "/api/stream") {
        const events = first
          ? [
              { type: "start" },
              {
                type: "toolcall_start",
                contentIndex: 0,
                id: "script-call",
                toolName: "codemode",
              },
              {
                type: "toolcall_delta",
                contentIndex: 0,
                delta: JSON.stringify({ code }),
              },
              {
                type: "toolcall_end",
                contentIndex: 0,
                toolCall: {
                  type: "toolCall",
                  id: "script-call",
                  name: "codemode",
                  arguments: { code },
                },
              },
              {
                type: "done",
                reason: "toolUse",
                usage: {
                  input: 1,
                  output: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 2,
                },
              },
            ]
          : [
              { type: "start" },
              { type: "text_start", contentIndex: 0 },
              { type: "text_delta", contentIndex: 0, delta: "finished" },
              { type: "text_end", contentIndex: 0 },
              {
                type: "done",
                reason: "stop",
                usage: {
                  input: 1,
                  output: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 2,
                },
              },
            ]
        res.end(
          'event: cache_policy\ndata: {"cacheRetention":"short"}\n\n' +
            events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
        )
      } else {
        const chunk = {
          id: "fixture",
          object: "chat.completion.chunk",
          created: 1,
          model: "fixture-model",
          choices: [
            {
              index: 0,
              delta: first
                ? {
                    tool_calls: [
                      {
                        index: 0,
                        id: "script-call",
                        type: "function",
                        function: {
                          name: "codemode",
                          arguments: JSON.stringify({ code }),
                        },
                      },
                    ],
                  }
                : { content: "finished" },
              finish_reason: null,
            },
          ],
        }
        const end = {
          ...chunk,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: first ? "tool_calls" : "stop",
            },
          ],
        }
        res.end(
          `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`
        )
      }
    })
    await new Promise<void>((resolve) =>
      piServer.listen(0, "127.0.0.1", resolve)
    )
    const piAddress = piServer.address()
    assert.ok(piAddress && typeof piAddress === "object")
    await writeFile(
      path.join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          fixture: {
            api: "openai-completions",
            baseUrl: `http://127.0.0.1:${piAddress.port}/v1`,
            apiKey: "fixture-key",
            models: [
              {
                id: "fixture-model",
                reasoning: false,
                input: ["text"],
                contextWindow: 16000,
                maxTokens: 2000,
              },
            ],
          },
        },
      })
    )
    await writeFile(
      path.join(agentDir, "settings.json"),
      JSON.stringify({
        defaultProvider: "fixture",
        defaultModel: "fixture-model",
        compaction: { enabled: false },
      })
    )
    const child = fork(
      path.join(root, `packages/worker-${kind}/dist/worker.mjs`),
      [],
      {
        cwd: root,
        env: {
          ...process.env,
          PI_CODING_AGENT_DIR: agentDir,
          PI_SERVER_URL: `http://127.0.0.1:${piAddress.port}`,
        },
        execArgv: process.execArgv,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      }
    )
    const sessionId = randomUUID()
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code))
    )
    let stderr = ""
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    const messages: WorkerToHostMessage[] = []
    child.on("message", (raw: unknown) =>
      messages.push(workerToHostMessageSchema.parse(raw))
    )
    try {
      const ready = await request(child, {
        type: "runtime.initialize",
        requestId: randomUUID(),
        payload: {
          webSessionId: sessionId,
          runtimeProfileId: kind,
          cwd,
          agentDir,
          webuiAdapters: [],
          target: { mode: "new" },
        },
      })
      assert.equal(ready.type, "runtime.ready")
      await Promise.race([
        toolsListed,
        new Promise((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Native MCP tools were not discovered")),
            10_000
          )
          toolsListed.then(() => clearTimeout(timer))
        }),
      ])
      const snapshot = await request(child, {
        type: "session.snapshot",
        requestId: randomUUID(),
        sessionId,
      })
      assert.equal(snapshot.type, "runtime.response")
      if (snapshot.type !== "runtime.response")
        throw new Error("Expected snapshot")
      const state = snapshot.data as {
        activeTools: string[]
        slashCommands: { name: string }[]
      }
      assert.ok(state.activeTools.includes("codemode"))
      assert.ok(state.slashCommands.some((command) => command.name === "mcp"))
      const status = waitFor(
        child,
        (message) =>
          message.type === "extension.ui.request" &&
          message.payload.method === "notify" &&
          message.payload.message.includes(
            "fixture: connected, 1 tools (codemode)"
          )
      )
      await request(child, {
        type: "session.prompt",
        requestId: randomUUID(),
        sessionId,
        payload: { message: "/mcp", images: [], streamingBehavior: "followUp" },
      })
      await status
      const reconnected = waitFor(
        child,
        (message) =>
          message.type === "extension.ui.request" &&
          message.payload.method === "notify" &&
          message.payload.message.includes(
            'Reconnected to MCP server "fixture"'
          )
      )
      await request(child, {
        type: "session.prompt",
        requestId: randomUUID(),
        sessionId,
        payload: {
          message: "/mcp reconnect fixture",
          images: [],
          streamingBehavior: "followUp",
        },
      })
      await reconnected
      const executed = waitFor(
        child,
        (message) =>
          message.type === "session.event" &&
          message.eventType === "tool_execution_end" &&
          JSON.stringify(message.payload).includes("Script completed")
      )
      await request(child, {
        type: "session.prompt",
        requestId: randomUUID(),
        sessionId,
        payload: {
          message: "Run the fixture script",
          images: [],
          streamingBehavior: "followUp",
        },
      })
      const finished = await executed
      assert.match(JSON.stringify(finished), /fixture result/)
      assert.deepEqual(toolArguments, [{ value: "from script" }])
      child.send({ type: "runtime.shutdown", requestId: randomUUID() })
      const shutdownTimeout = setTimeout(() => child.kill(), 5_000)
      try {
        assert.equal(await exited, 0, stderr)
      } finally {
        clearTimeout(shutdownTimeout)
      }
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; stderr=${stderr}; requests=${JSON.stringify(requests)}; events=${JSON.stringify(messages.slice(-5))}`
      )
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill()
      await exited
      mcp.closeAllConnections()
      piServer.closeAllConnections()
      await Promise.all([
        new Promise<void>((resolve) => mcp.close(() => resolve())),
        new Promise<void>((resolve) => piServer.close(() => resolve())),
      ])
      await rm(directory, { recursive: true, force: true })
    }
  })
}
