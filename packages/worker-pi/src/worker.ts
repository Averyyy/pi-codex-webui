import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent"
import {
  hostToWorkerMessageSchema,
  type HostToWorkerMessage,
  type RuntimeError,
  type RuntimeSnapshot,
  type WorkerToHostMessage,
} from "@workspace/runtime-protocol"

let runtime: AgentSessionRuntime | undefined
let webSessionId: string | undefined
let nativeSessionFile: string | undefined
let unsubscribe: (() => void) | undefined
let eventSequence = 0

function send(message: WorkerToHostMessage) {
  if (!process.send) throw new Error("Pi worker requires a Node IPC channel.")
  process.send(message)
}

function runtimeError(error: unknown): RuntimeError {
  return error instanceof Error
    ? { code: error.name, message: error.message }
    : { code: "UnknownError", message: String(error) }
}

function respond(
  requestId: string,
  result: { success: true; data?: unknown } | { success: false; error: unknown }
) {
  send(
    result.success
      ? {
          type: "runtime.response",
          requestId,
          success: true,
          data: result.data,
        }
      : {
          type: "runtime.response",
          requestId,
          success: false,
          error: runtimeError(result.error),
        }
  )
}

function currentRuntime() {
  if (!runtime || !webSessionId || !nativeSessionFile) {
    throw new Error("Pi runtime has not been initialized.")
  }
  return runtime
}

function snapshot(session: AgentSession): RuntimeSnapshot {
  if (!webSessionId || !nativeSessionFile) {
    throw new Error("Pi runtime identity is not initialized.")
  }
  const model = session.model
  return {
    webSessionId,
    nativeSessionId: session.sessionId,
    nativeSessionFile,
    cwd: currentRuntime().cwd,
    sessionName: session.sessionName,
    model: model
      ? { provider: model.provider, id: model.id, name: model.name }
      : null,
    availableModels: session.modelRegistry.getAvailable().map((available) => ({
      provider: available.provider,
      id: available.id,
      name: available.name,
      reasoning: available.reasoning,
      input: available.input,
      contextWindow: available.contextWindow,
      maxTokens: available.maxTokens,
    })),
    thinkingLevel: session.thinkingLevel,
    availableThinkingLevels: session.getAvailableThinkingLevels(),
    activeTools: session.getActiveToolNames(),
    isStreaming: session.isStreaming,
    isCompacting: session.isCompacting,
  }
}

function bindSession(session: AgentSession) {
  unsubscribe?.()
  unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (!webSessionId) return
    eventSequence += 1
    send({
      type: "session.event",
      sessionId: webSessionId,
      seq: eventSequence,
      eventType: event.type,
      payload: event,
    })
  })
}

async function initialize(
  message: Extract<HostToWorkerMessage, { type: "runtime.initialize" }>
) {
  if (runtime) throw new Error("Pi runtime is already initialized.")

  const target = SessionManager.open(message.payload.nativeSessionFile)
  if (target.getSessionId() === "") {
    throw new Error("Pi session has no native session ID.")
  }

  webSessionId = message.payload.webSessionId
  nativeSessionFile = message.payload.nativeSessionFile
  const createRuntime = async (options: {
    cwd: string
    agentDir: string
    sessionManager: SessionManager
    sessionStartEvent?: {
      type: "session_start"
      reason: "startup" | "reload" | "new" | "resume" | "fork"
      previousSessionFile?: string
    }
  }) => {
    const services = await createAgentSessionServices({
      cwd: options.cwd,
      agentDir: options.agentDir,
    })
    const created = await createAgentSessionFromServices({
      services,
      sessionManager: options.sessionManager,
      sessionStartEvent: options.sessionStartEvent,
    })
    return { ...created, services, diagnostics: services.diagnostics }
  }

  runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: message.payload.cwd,
    agentDir: message.payload.agentDir,
    sessionManager: target,
    sessionStartEvent: { type: "session_start", reason: "resume" },
  })
  runtime.setRebindSession(async (session) => bindSession(session))
  bindSession(runtime.session)

  send({
    type: "runtime.ready",
    requestId: message.requestId,
    payload: snapshot(runtime.session),
  })
}

function assertSession(message: { sessionId: string }) {
  if (!webSessionId || message.sessionId !== webSessionId) {
    throw new Error(`Worker does not own Web session ${message.sessionId}.`)
  }
}

async function prompt(
  message: Extract<HostToWorkerMessage, { type: "session.prompt" }>
) {
  assertSession(message)
  const session = currentRuntime().session
  const queued = session.isStreaming
  let accepted = false
  await session.prompt(message.payload.message, {
    images: message.payload.images,
    source: "rpc",
    streamingBehavior: session.isStreaming
      ? message.payload.streamingBehavior
      : undefined,
    preflightResult(success) {
      if (!success || accepted) return
      accepted = true
      respond(message.requestId, {
        success: true,
        data: { accepted: true, queued },
      })
    },
  })
  if (!accepted) {
    respond(message.requestId, {
      success: true,
      data: { accepted: true, queued },
    })
  }
}

async function dispatch(message: HostToWorkerMessage) {
  if (message.type === "runtime.initialize") {
    await initialize(message)
    return
  }
  if (message.type === "runtime.shutdown") {
    unsubscribe?.()
    await runtime?.dispose()
    respond(message.requestId, { success: true })
    process.disconnect?.()
    setImmediate(() => process.exit(0))
    return
  }

  assertSession(message)
  const session = currentRuntime().session
  if (message.type === "session.prompt") {
    await prompt(message)
  } else if (message.type === "session.abort") {
    await session.abort()
    respond(message.requestId, { success: true, data: snapshot(session) })
  } else if (message.type === "session.snapshot") {
    respond(message.requestId, { success: true, data: snapshot(session) })
  } else if (message.type === "session.set-model") {
    const model = session.modelRegistry.find(
      message.payload.provider,
      message.payload.modelId
    )
    if (!model) {
      throw new Error(
        `Unknown Pi model ${message.payload.provider}/${message.payload.modelId}.`
      )
    }
    await session.setModel(model)
    respond(message.requestId, { success: true, data: snapshot(session) })
  } else if (message.type === "session.set-thinking-level") {
    session.setThinkingLevel(message.payload.level)
    respond(message.requestId, { success: true, data: snapshot(session) })
  } else if (message.type === "session.compact") {
    const result = await session.compact(message.payload.instructions)
    respond(message.requestId, { success: true, data: result })
  }
}

process.on("message", (raw: unknown) => {
  const parsed = hostToWorkerMessageSchema.safeParse(raw)
  if (!parsed.success) {
    send({
      type: "runtime.fatal",
      error: {
        code: "InvalidIpcMessage",
        message: parsed.error.message,
      },
    })
    process.exitCode = 1
    process.disconnect?.()
    return
  }

  void dispatch(parsed.data).catch((error) => {
    respond(parsed.data.requestId, { success: false, error })
  })
})

process.on("uncaughtException", (error) => {
  send({ type: "runtime.fatal", error: runtimeError(error) })
  process.exit(1)
})

process.on("unhandledRejection", (error) => {
  send({ type: "runtime.fatal", error: runtimeError(error) })
  process.exit(1)
})
