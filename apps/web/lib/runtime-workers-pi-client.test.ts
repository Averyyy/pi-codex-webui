import assert from "node:assert/strict"
import { fork, type ChildProcess } from "node:child_process"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import test from "node:test"

import {
  runtimeSnapshotSchema,
  workerToHostMessageSchema,
  type HostToWorkerMessage,
  type WorkerToHostMessage,
} from "@workspace/runtime-protocol"

const root = path.resolve(import.meta.dirname, "../../..")

type RequestRecord = {
  method: string
  path: string
  authorization: string | undefined
  body: Record<string, unknown>
}

function parseBody(raw: string): Record<string, unknown> {
  if (!raw) return {}
  const value: unknown = JSON.parse(raw)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object request body")
  }
  return value as Record<string, unknown>
}

async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" })
  response.end(JSON.stringify(body))
}

function streamResponse(response: ServerResponse) {
  response.writeHead(200, {
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
  })
  response.end(
    [
      'data: {"type":"start"}\n\n',
      'data: {"type":"text_start","contentIndex":0}\n\n',
      'data: {"type":"text_delta","contentIndex":0,"delta":"fixture answer"}\n\n',
      'data: {"type":"text_end","contentIndex":0}\n\n',
      'data: {"type":"done","reason":"stop","usage":{"input":1,"output":2,"cacheRead":0,"cacheWrite":0,"totalTokens":3}}\n\n',
    ].join("")
  )
}

class PiServerFixture {
  readonly requests: RequestRecord[] = []
  private readonly server: Server
  private initRequests = 0
  private streamError = false

  constructor(private readonly authToken: string) {
    this.server = createServer(async (request, response) => {
      const body = parseBody(await requestBody(request))
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname
      this.requests.push({
        method: request.method ?? "",
        path: pathname,
        authorization: request.headers.authorization,
        body,
      })

      if (request.headers.authorization !== `Bearer ${this.authToken}`) {
        sendJson(response, 401, { error: "Unauthorized" })
        return
      }

      if (request.method !== "POST") {
        sendJson(response, 404, { error: "Not found" })
        return
      }

      if (pathname === "/api/session/init") {
        this.initRequests += 1
        if (this.initRequests === 1) {
          sendJson(response, 500, {
            error: "temporary init failure",
            code: "TEMPORARY_INIT_FAILURE",
          })
          return
        }
        sendJson(response, 200, {
          sessionId: body.sessionId,
          staticContextHash: "fixture-static-context",
          treeHash: "fixture-tree",
          messageCount: 0,
          entryCount: 0,
          leafId: null,
          revision: 0,
        })
        return
      }

      if (pathname === "/api/stream") {
        if (this.streamError) {
          sendJson(response, 400, {
            error: "fixture stream failure",
            code: "FIXTURE_STREAM_FAILURE",
          })
          return
        }
        streamResponse(response)
        return
      }

      sendJson(response, 404, { error: "Not found" })
    })
  }

  async listen() {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject)
      this.server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = this.server.address()
    if (!address || typeof address === "string") {
      throw new Error("Pi-server fixture did not receive a TCP address")
    }
    return `http://127.0.0.1:${address.port}`
  }

  failStreams() {
    this.streamError = true
  }

  async close() {
    if (!this.server.listening) return
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

class WorkerMessages {
  readonly messages: WorkerToHostMessage[] = []
  private readonly listeners = new Set<(message: WorkerToHostMessage) => void>()

  constructor(readonly child: ChildProcess) {
    child.stderr?.resume()
    child.stdout?.resume()
    child.on("message", (raw: unknown) => {
      const message = workerToHostMessageSchema.parse(raw)
      this.messages.push(message)
      for (const listener of this.listeners) listener(message)
    })
  }

  waitFor(
    predicate: (message: WorkerToHostMessage) => boolean,
    timeoutMs = 30_000
  ) {
    const existing = this.messages.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise<WorkerToHostMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener)
        reject(new Error("Timed out waiting for worker message"))
      }, timeoutMs)
      const listener = (message: WorkerToHostMessage) => {
        if (!predicate(message)) return
        clearTimeout(timeout)
        this.listeners.delete(listener)
        resolve(message)
      }
      this.listeners.add(listener)
    })
  }
}

function startWorker(entry: string, environment: NodeJS.ProcessEnv) {
  return fork(path.join(root, entry), [], {
    cwd: root,
    env: environment,
    execArgv: process.execArgv,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  })
}

async function stopWorker(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve())
  )
  if (child.connected) {
    child.send({ type: "runtime.shutdown", requestId: randomUUID() })
  } else {
    child.kill()
  }
  await exited
}

async function requestReady(
  messages: WorkerMessages,
  request: Extract<HostToWorkerMessage, { type: "runtime.initialize" }>
) {
  messages.child.send(request)
  const message = await messages.waitFor(
    (candidate) =>
      (candidate.type === "runtime.ready" &&
        candidate.requestId === request.requestId) ||
      candidate.type === "runtime.fatal"
  )
  if (message.type === "runtime.fatal") {
    throw new Error(message.error.message)
  }
  if (message.type !== "runtime.ready") {
    throw new Error("Worker initialization did not return runtime.ready")
  }
  return runtimeSnapshotSchema.parse(message.payload)
}

async function request(messages: WorkerMessages, message: HostToWorkerMessage) {
  messages.child.send(message)
  const response = await messages.waitFor(
    (candidate) =>
      candidate.type === "runtime.response" &&
      candidate.requestId === message.requestId
  )
  if (response.type !== "runtime.response") {
    throw new Error("Worker did not return runtime.response")
  }
  if (!response.success) throw new Error(response.error?.message)
  return response.data
}

test("Pi Client worker speaks the authenticated pi-server protocol", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-client-worker-"))
  const cwd = path.join(directory, "project")
  const agentDir = path.join(directory, "agent")
  const authToken = "fixture-server-token"
  let child: ChildProcess | undefined
  const fixture = new PiServerFixture(authToken)

  try {
    await Promise.all([mkdir(cwd), mkdir(agentDir)])
    const serverUrl = await fixture.listen()
    await writeFile(
      path.join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          fixture: {
            name: "Fixture provider",
            api: "openai-completions",
            baseUrl: `${serverUrl}/v1`,
            apiKey: "fixture-provider-key",
            models: [
              {
                id: "fixture-model",
                name: "Fixture model",
                reasoning: false,
                input: ["text"],
                contextWindow: 16_000,
                maxTokens: 2_000,
              },
            ],
          },
        },
      })
    )

    child = startWorker("packages/worker-pi-client/src/worker.ts", {
      ...process.env,
      PI_CODING_AGENT_DIR: agentDir,
      PI_SERVER_AUTH_TOKEN: authToken,
      PI_SERVER_URL: serverUrl,
    })
    const messages = new WorkerMessages(child)
    const webSessionId = randomUUID()
    const snapshot = await requestReady(messages, {
      type: "runtime.initialize",
      requestId: randomUUID(),
      payload: {
        webSessionId,
        runtimeProfileId: "pi-client-fixture",
        cwd,
        agentDir,
        mcpTools: [],
        webuiAdapters: [],
        target: { mode: "new" },
      },
    })

    assert.equal(snapshot.model?.provider, "fixture")
    assert.equal(snapshot.model?.id, "fixture-model")
    assert.equal(
      snapshot.availableModels.some(
        (model) => model.provider === "fixture" && model.id === "fixture-model"
      ),
      true
    )
    assert.equal(fixture.requests.length, 0)

    const firstPromptId = randomUUID()
    await request(messages, {
      type: "session.prompt",
      requestId: firstPromptId,
      sessionId: webSessionId,
      payload: {
        message: "hello fixture",
        images: [],
        streamingBehavior: "followUp",
      },
    })
    const firstMessageEnd = await messages.waitFor((message) => {
      if (
        message.type !== "session.event" ||
        message.sessionId !== webSessionId ||
        message.eventType !== "message_end"
      ) {
        return false
      }
      const payload = message.payload
      return (
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "object" &&
        payload.message !== null &&
        "role" in payload.message &&
        payload.message.role === "assistant"
      )
    })
    assert.equal(firstMessageEnd.type, "session.event")
    assert.equal(
      JSON.stringify(firstMessageEnd.payload).includes("fixture answer"),
      true
    )

    assert.equal(
      fixture.requests.filter(
        ({ path: requestPath }) => requestPath === "/api/session/init"
      ).length,
      2
    )
    assert.equal(
      fixture.requests.some(
        ({ path: requestPath }) => requestPath === "/api/stream"
      ),
      true
    )
    assert.equal(
      fixture.requests.every(
        ({ authorization }) => authorization === `Bearer ${authToken}`
      ),
      true
    )

    fixture.failStreams()
    const errorPromptId = randomUUID()
    await request(messages, {
      type: "session.prompt",
      requestId: errorPromptId,
      sessionId: webSessionId,
      payload: {
        message: "trigger fixture error",
        images: [],
        streamingBehavior: "followUp",
      },
    })
    const errorMessageEnd = await messages.waitFor(
      (message) =>
        message.type === "session.event" &&
        message.sessionId === webSessionId &&
        message.eventType === "message_end" &&
        JSON.stringify(message.payload).includes("fixture stream failure")
    )
    assert.equal(errorMessageEnd.type, "session.event")

    const afterError = await request(messages, {
      type: "session.snapshot",
      requestId: randomUUID(),
      sessionId: webSessionId,
    })
    assert.equal(
      runtimeSnapshotSchema.parse(afterError).webSessionId,
      webSessionId
    )
  } finally {
    try {
      if (child) await stopWorker(child)
    } finally {
      try {
        await fixture.close()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  }
})
