import { randomUUID } from "node:crypto"

import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
  ExtensionUIContext,
  KeybindingsManager,
  SessionManager,
} from "@earendil-works/pi-coding-agent"
import type { EditorComponent, EditorTheme } from "@earendil-works/pi-tui"
import {
  hostToWorkerMessageSchema,
  type ExtensionUIRequest,
  type ExtensionUIResponse,
  type HostToWorkerMessage,
  type McpCallResult,
  type RuntimeError,
  type RuntimeSnapshot,
  type WorkerToHostMessage,
} from "@workspace/runtime-protocol"

import {
  handleResourceMessage,
  isResourceMessage,
  projectTrustedForWeb,
} from "./resources.js"
import { createSettingsManager } from "./settings.js"
import type { CodingAgentModule, TuiModule } from "./coding-agent.js"
import { createMcpToolDefinitions } from "./mcp.js"
import { createFooterData, TuiSurfaceManager } from "./tui-surfaces.js"
import { createExtensionInstrumentor } from "./extension-instrumentation.js"
import { WebUiAdapterHost } from "./webui-adapter-host.js"

let codingAgent: CodingAgentModule
let tuiModule: TuiModule
let runtime: AgentSessionRuntime | undefined
let webSessionId: string | undefined
let nativeSessionFile: string | undefined
let unsubscribe: (() => void) | undefined
let eventSequence = 0
let surfaceManager: TuiSurfaceManager | undefined
let adapterHost: WebUiAdapterHost | undefined
let editorComponentFactory: Parameters<
  ExtensionUIContext["setEditorComponent"]
>[0]
const extensionStatuses = new Map<string, string>()
const pendingExtensionRequests = new Map<
  string,
  (response: ExtensionUIResponse) => void
>()
const pendingMcpCalls = new Map<
  string,
  {
    resolve: (result: McpCallResult) => void
    reject: (error: Error) => void
    removeAbortListener: () => void
  }
>()

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

function abortError(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("MCP tool call was aborted.")
}

function invokeMcpTool(
  serverId: string,
  toolName: string,
  arguments_: Record<string, unknown>,
  signal: AbortSignal | undefined
) {
  if (!webSessionId) throw new Error("Pi runtime identity is not initialized.")
  if (signal?.aborted) return Promise.reject(abortError(signal))

  const requestId = randomUUID()
  return new Promise<McpCallResult>((resolve, reject) => {
    const abort = () => {
      if (!pendingMcpCalls.delete(requestId)) return
      signal?.removeEventListener("abort", abort)
      send({
        type: "mcp.call.cancel",
        requestId,
        sessionId: webSessionId!,
      })
      reject(signal ? abortError(signal) : new Error("MCP call aborted."))
    }
    signal?.addEventListener("abort", abort, { once: true })
    pendingMcpCalls.set(requestId, {
      resolve,
      reject,
      removeAbortListener: () => signal?.removeEventListener("abort", abort),
    })
    send({
      type: "mcp.call.request",
      requestId,
      sessionId: webSessionId!,
      payload: { serverId, toolName, arguments: arguments_ },
    })
  })
}

function handleMcpCallResponse(
  message: Extract<HostToWorkerMessage, { type: "mcp.call.response" }>
) {
  const pending = pendingMcpCalls.get(message.requestId)
  if (!pending) return
  pendingMcpCalls.delete(message.requestId)
  pending.removeAbortListener()
  if (message.success && message.result) pending.resolve(message.result)
  else {
    pending.reject(
      new Error(message.error?.message ?? "The MCP tool call failed.")
    )
  }
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

function emitExtensionUI(requestId: string, payload: ExtensionUIRequest) {
  if (!webSessionId) throw new Error("Pi runtime identity is not initialized.")
  send({
    type: "extension.ui.request",
    requestId,
    sessionId: webSessionId,
    payload,
  })
}

function currentTheme() {
  codingAgent.initTheme(currentRuntime().services.settingsManager.getTheme())
  const value = (globalThis as typeof globalThis & { [key: symbol]: unknown })[
    Symbol.for("@earendil-works/pi-coding-agent:theme")
  ]
  if (!value) throw new Error("Pi did not initialize its TUI theme.")
  return value as ExtensionUIContext["theme"]
}

function currentSurfaceManager() {
  if (!surfaceManager) throw new Error("Pi TUI surfaces are not initialized.")
  return surfaceManager
}

function currentAdapterHost() {
  if (!adapterHost) throw new Error("WebUI adapter host is not initialized.")
  return adapterHost
}

function createEditorTheme(theme: ExtensionUIContext["theme"]): EditorTheme {
  return {
    borderColor: (text) => theme.fg("borderMuted", text),
    selectList: codingAgent.getSelectListTheme(),
  }
}

function resetSurfaceManager() {
  surfaceManager?.dispose()
  extensionStatuses.clear()
  editorComponentFactory = undefined
  const session = currentRuntime().session
  const theme = currentTheme()
  surfaceManager = new TuiSurfaceManager(
    tuiModule,
    theme,
    tuiModule.getKeybindings() as unknown as KeybindingsManager,
    createFooterData(
      currentRuntime().cwd,
      extensionStatuses,
      () =>
        new Set(
          session.modelRegistry.getAvailable().map((model) => model.provider)
        ).size
    ),
    (event) => {
      if (!webSessionId) {
        throw new Error("Pi runtime identity is not initialized.")
      }
      send({
        type: "tui.surface.event",
        sessionId: webSessionId,
        payload: event,
      })
    }
  )
}

function createDialogPromise<T>(
  options: { signal?: AbortSignal; timeout?: number } | undefined,
  defaultValue: T,
  payload: ExtensionUIRequest,
  parse: (response: ExtensionUIResponse) => T
) {
  if (options?.signal?.aborted) return Promise.resolve(defaultValue)
  const requestId = randomUUID()
  return new Promise<T>((resolve) => {
    let timeout: NodeJS.Timeout | undefined
    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      options?.signal?.removeEventListener("abort", abort)
      pendingExtensionRequests.delete(requestId)
    }
    const finish = (value: T) => {
      cleanup()
      resolve(value)
    }
    const abort = () => finish(defaultValue)
    options?.signal?.addEventListener("abort", abort, { once: true })
    if (options?.timeout) {
      timeout = setTimeout(() => finish(defaultValue), options.timeout)
    }
    pendingExtensionRequests.set(requestId, (response) =>
      finish(parse(response))
    )
    emitExtensionUI(requestId, payload)
  })
}

function createExtensionUIContext() {
  const emit = (payload: ExtensionUIRequest) =>
    emitExtensionUI(randomUUID(), payload)
  const theme = currentTheme()
  return {
    select: (
      title: string,
      options: string[],
      dialogOptions?: Parameters<ExtensionUIContext["select"]>[2]
    ) =>
      createDialogPromise(
        dialogOptions,
        undefined,
        { method: "select", title, options, timeout: dialogOptions?.timeout },
        (response) => ("value" in response ? response.value : undefined)
      ),
    confirm: (
      title: string,
      message: string,
      dialogOptions?: Parameters<ExtensionUIContext["confirm"]>[2]
    ) =>
      createDialogPromise(
        dialogOptions,
        false,
        { method: "confirm", title, message, timeout: dialogOptions?.timeout },
        (response) => ("confirmed" in response ? response.confirmed : false)
      ),
    input: (
      title: string,
      placeholder?: string,
      dialogOptions?: Parameters<ExtensionUIContext["input"]>[2]
    ) =>
      createDialogPromise(
        dialogOptions,
        undefined,
        {
          method: "input",
          title,
          placeholder,
          timeout: dialogOptions?.timeout,
        },
        (response) => ("value" in response ? response.value : undefined)
      ),
    editor: (title: string, prefill?: string) =>
      createDialogPromise(
        undefined,
        undefined,
        { method: "editor", title, prefill },
        (response) => ("value" in response ? response.value : undefined)
      ),
    notify: (message: string, notifyType?: "info" | "warning" | "error") =>
      emit({ method: "notify", message, notifyType }),
    setStatus: (statusKey: string, statusText: string | undefined) => {
      if (statusText === undefined) extensionStatuses.delete(statusKey)
      else extensionStatuses.set(statusKey, statusText)
      currentSurfaceManager().requestRender("footer")
      emit({ method: "setStatus", statusKey, statusText })
    },
    setWidget: (
      widgetKey: string,
      content: unknown,
      options?: { placement?: "aboveEditor" | "belowEditor" }
    ) => {
      const slot = `widget:${widgetKey}`
      if (content === undefined || Array.isArray(content)) {
        currentSurfaceManager().remove(slot)
        emit({
          method: "setWidget",
          widgetKey,
          widgetLines: content,
          widgetPlacement: options?.placement,
        })
      } else if (typeof content === "function") {
        emit({ method: "setWidget", widgetKey })
        currentSurfaceManager().set(
          slot,
          "inline",
          options?.placement ?? "aboveEditor",
          (tui) => content(tui, theme)
        )
      } else {
        throw new TypeError(
          "Pi widgets must be line arrays or component factories."
        )
      }
    },
    setEditorText: (text: string) => {
      const editor =
        currentSurfaceManager().component<EditorComponent>("editor")
      if (editor) {
        editor.setText(text)
        currentSurfaceManager().requestRender("editor")
      } else emit({ method: "set_editor_text", text })
    },
    pasteToEditor: (text: string) => {
      const editor =
        currentSurfaceManager().component<EditorComponent>("editor")
      if (editor) editor.handleInput(`\x1b[200~${text}\x1b[201~`)
      else emit({ method: "set_editor_text", text })
    },
    getEditorText: () =>
      currentSurfaceManager().component<EditorComponent>("editor")?.getText() ??
      "",
    onTerminalInput: (handler) => currentSurfaceManager().onInput(handler),
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setFooter: (factory) => {
      if (factory) currentSurfaceManager().setFooter(factory)
      else currentSurfaceManager().remove("footer")
    },
    setHeader: (factory) => {
      if (factory) {
        currentSurfaceManager().set("header", "inline", "header", (tui) =>
          factory(tui, theme)
        )
      } else currentSurfaceManager().remove("header")
    },
    setTitle: (title: string) => emit({ method: "set_title", title }),
    custom: (factory, options) =>
      currentSurfaceManager().custom(factory, options),
    addAutocompleteProvider: () => {},
    setEditorComponent: (factory) => {
      editorComponentFactory = factory
      if (factory) {
        currentSurfaceManager().setEditor(factory, createEditorTheme(theme))
      } else currentSurfaceManager().remove("editor")
    },
    getEditorComponent: () => editorComponentFactory,
    get theme() {
      return theme
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({
      success: false as const,
      error: "Theme switching is not supported by the Web runtime.",
    }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  } as ExtensionUIContext
}

async function bindSession(session: AgentSession) {
  resetSurfaceManager()
  await session.bindExtensions({
    uiContext: createExtensionUIContext(),
    mode: "rpc",
    commandContextActions: {
      waitForIdle: () => session.waitForIdle(),
      newSession: (options) => currentRuntime().newSession(options),
      fork: async (entryId, options) => {
        const result = await currentRuntime().fork(entryId, options)
        return { cancelled: result.cancelled }
      },
      navigateTree: async (entryId, options) => {
        const result = await session.navigateTree(entryId, options)
        return { cancelled: result.cancelled }
      },
      switchSession: (sessionPath, options) =>
        currentRuntime().switchSession(sessionPath, options),
      reload: () => session.reload(),
    },
    shutdownHandler: () => {
      void shutdown()
    },
    onError: (error) => {
      send({
        type: "runtime.log",
        sessionId: webSessionId,
        payload: {
          level: "stderr",
          message: `${error.extensionPath}: ${error.error}\n`,
        },
      })
    },
  })
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

  const target =
    message.payload.target.mode === "new"
      ? codingAgent.SessionManager.create(message.payload.cwd)
      : codingAgent.SessionManager.open(
          message.payload.target.mode === "resume"
            ? message.payload.target.nativeSessionFile
            : message.payload.target.sourceSessionFile
        )
  if (message.payload.target.mode === "duplicate") {
    const leafId = target.getLeafId()
    if (leafId) target.createBranchedSession(leafId)
    else
      target.newSession({
        parentSession: message.payload.target.sourceSessionFile,
      })
  }
  if (target.getSessionId() === "") {
    throw new Error("Pi session has no native session ID.")
  }

  webSessionId = message.payload.webSessionId
  const mcpTools = createMcpToolDefinitions(
    message.payload.mcpTools,
    invokeMcpTool
  )
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
    const settingsManager = createSettingsManager(
      codingAgent,
      options.cwd,
      options.agentDir,
      projectTrustedForWeb(codingAgent, options.cwd, options.agentDir)
    )
    adapterHost?.dispose()
    adapterHost = new WebUiAdapterHost({
      descriptors: message.payload.webuiAdapters,
      session: () => ({
        cwd: currentRuntime().cwd,
        sessionFile: currentRuntime().session.sessionFile,
        listSessions: async () =>
          (
            await codingAgent.SessionManager.list(
              currentRuntime().cwd,
              currentRuntime().session.sessionManager.getSessionDir()
            )
          ).map((session) => ({
            sessionPath: session.path,
            id: session.id,
            cwd: session.cwd,
            name: session.name,
            createdAt: session.created.toISOString(),
            updatedAt: session.modified.toISOString(),
            messageCount: session.messageCount,
            firstMessage: session.firstMessage,
          })),
        switchSession: (sessionPath) =>
          currentRuntime().switchSession(sessionPath),
      }),
      emitView: (event) => {
        if (!webSessionId) {
          throw new Error("Pi runtime identity is not initialized.")
        }
        send({
          type: "webui.view.event",
          sessionId: webSessionId,
          payload: event,
        })
      },
      emitStatus: (status) => {
        if (!webSessionId) {
          throw new Error("Pi runtime identity is not initialized.")
        }
        send({
          type: "webui.extension.status",
          sessionId: webSessionId,
          payload: status,
        })
      },
    })
    const services = await codingAgent.createAgentSessionServices({
      cwd: options.cwd,
      agentDir: options.agentDir,
      settingsManager,
      resourceLoaderOptions: {
        extensionsOverride: createExtensionInstrumentor(() =>
          currentAdapterHost()
        ),
      },
    })
    await adapterHost.initialize(
      services.resourceLoader.getExtensions().extensions
    )
    const created = await codingAgent.createAgentSessionFromServices({
      services,
      sessionManager: options.sessionManager,
      sessionStartEvent: options.sessionStartEvent,
      customTools: mcpTools,
    })
    return { ...created, services, diagnostics: services.diagnostics }
  }

  runtime = await codingAgent.createAgentSessionRuntime(createRuntime, {
    cwd: message.payload.cwd,
    agentDir: message.payload.agentDir,
    sessionManager: target,
    sessionStartEvent: {
      type: "session_start",
      reason:
        message.payload.target.mode === "resume"
          ? "resume"
          : message.payload.target.mode === "duplicate"
            ? "fork"
            : "new",
      ...(message.payload.target.mode === "duplicate"
        ? { previousSessionFile: message.payload.target.sourceSessionFile }
        : {}),
    },
  })
  nativeSessionFile = runtime.session.sessionFile
  if (!nativeSessionFile) {
    throw new Error("Pi did not assign a file to the initialized session.")
  }
  if (message.payload.target.mode !== "resume") {
    runtime.session.exportToJsonl(nativeSessionFile)
    runtime.session.sessionManager.setSessionFile(nativeSessionFile)
  }
  runtime.setRebindSession(async (session) => {
    nativeSessionFile = session.sessionFile
    await bindSession(session)
  })
  await bindSession(runtime.session)

  send({
    type: "runtime.ready",
    requestId: message.requestId,
    payload: snapshot(runtime.session),
  })
}

async function shutdown() {
  unsubscribe?.()
  surfaceManager?.dispose()
  surfaceManager = undefined
  adapterHost?.dispose()
  adapterHost = undefined
  for (const resolve of pendingExtensionRequests.values()) {
    resolve({ cancelled: true })
  }
  pendingExtensionRequests.clear()
  for (const pending of pendingMcpCalls.values()) {
    pending.removeAbortListener()
    pending.reject(new Error("Pi runtime is shutting down."))
  }
  pendingMcpCalls.clear()
  await runtime?.dispose()
  process.disconnect?.()
  setImmediate(() => process.exit(0))
}

async function replaceSession(
  message: Extract<
    HostToWorkerMessage,
    {
      type: "session.new" | "session.clone" | "session.fork" | "session.import"
    }
  >
) {
  const previousWebSessionId = webSessionId
  webSessionId = message.payload.nextWebSessionId
  try {
    let result: { cancelled: boolean }
    if (message.type === "session.new") {
      result = await currentRuntime().newSession()
      const session = currentRuntime().session
      if (!session.sessionFile) {
        throw new Error("Pi did not assign a file to the new session.")
      }
      session.exportToJsonl(session.sessionFile)
      session.sessionManager.setSessionFile(session.sessionFile)
    } else if (message.type === "session.clone") {
      const leafId = currentRuntime().session.sessionManager.getLeafId()
      if (!leafId)
        throw new Error("Cannot clone a session without an active entry.")
      result = await currentRuntime().fork(leafId, { position: "at" })
    } else if (message.type === "session.fork") {
      result = await currentRuntime().fork(message.payload.entryId, {
        position: message.payload.position,
      })
    } else {
      result = await currentRuntime().importFromJsonl(
        message.payload.inputPath,
        message.payload.cwdOverride
      )
    }
    if (result.cancelled) webSessionId = previousWebSessionId
    return {
      cancelled: result.cancelled,
      snapshot: snapshot(currentRuntime().session),
    }
  } catch (error) {
    webSessionId = previousWebSessionId
    throw error
  }
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
  if (message.type === "mcp.call.response") {
    handleMcpCallResponse(message)
    return
  }
  if (isResourceMessage(message)) {
    respond(message.requestId, {
      success: true,
      data: await handleResourceMessage(codingAgent, message),
    })
    return
  }
  if (message.type === "runtime.initialize") {
    await initialize(message)
    return
  }
  if (message.type === "runtime.shutdown") {
    respond(message.requestId, { success: true })
    await shutdown()
    return
  }
  if (message.type === "runtime.rebind-web-session") {
    webSessionId = message.payload.webSessionId
    respond(message.requestId, {
      success: true,
      data: snapshot(currentRuntime().session),
    })
    return
  }

  assertSession(message)
  const session = currentRuntime().session
  if (message.type === "runtime.reload-resources") {
    currentRuntime().services.settingsManager.setProjectTrusted(
      projectTrustedForWeb(
        codingAgent,
        currentRuntime().cwd,
        currentRuntime().services.agentDir
      )
    )
    await session.reload()
    await currentAdapterHost().initialize(
      currentRuntime().services.resourceLoader.getExtensions().extensions
    )
    respond(message.requestId, { success: true, data: snapshot(session) })
  } else if (message.type === "tui.surface.list") {
    respond(message.requestId, {
      success: true,
      data: await currentSurfaceManager().snapshots(),
    })
  } else if (message.type === "tui.surface.action") {
    currentSurfaceManager().action(
      message.payload.surfaceId,
      message.payload.action
    )
    respond(message.requestId, { success: true })
  } else if (message.type === "webui.view.list") {
    respond(message.requestId, {
      success: true,
      data: currentAdapterHost().snapshots(),
    })
  } else if (message.type === "webui.action.invoke") {
    respond(message.requestId, {
      success: true,
      data: await currentAdapterHost().action(
        message.payload.extensionId,
        message.payload.instanceId,
        message.payload.actionId,
        message.payload.input
      ),
    })
  } else if (message.type === "webui.client.status") {
    currentAdapterHost().clientStatus(
      message.payload.extensionId,
      message.payload.instanceId,
      message.payload.status,
      message.payload.message
    )
    respond(message.requestId, { success: true })
  } else if (message.type === "session.prompt") {
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
  } else if (
    message.type === "session.new" ||
    message.type === "session.clone" ||
    message.type === "session.fork" ||
    message.type === "session.import"
  ) {
    respond(message.requestId, {
      success: true,
      data: await replaceSession(message),
    })
  } else if (message.type === "session.rename") {
    session.setSessionName(message.payload.name)
    respond(message.requestId, { success: true, data: snapshot(session) })
  } else if (message.type === "session.navigate-tree") {
    const result = await session.navigateTree(message.payload.entryId, {
      summarize: message.payload.summarize,
    })
    respond(message.requestId, {
      success: true,
      data: {
        ...result,
        leafId: session.sessionManager.getLeafId(),
        snapshot: snapshot(session),
      },
    })
  } else if (message.type === "session.stats") {
    respond(message.requestId, {
      success: true,
      data: session.getSessionStats(),
    })
  } else if (message.type === "session.tree") {
    const manager = session.sessionManager
    const userMessages = new Map(
      session
        .getUserMessagesForForking()
        .map((entry) => [entry.entryId, entry.text])
    )
    respond(message.requestId, {
      success: true,
      data: {
        entries: manager.getEntries().map((entry) => ({
          id: entry.id,
          parentId: entry.parentId,
          type: entry.type,
          timestamp: entry.timestamp,
          label: manager.getLabel(entry.id),
          role:
            entry.type === "message" && "role" in entry.message
              ? entry.message.role
              : undefined,
          text: userMessages.get(entry.id),
        })),
        leafId: manager.getLeafId(),
      },
    })
  } else if (message.type === "session.export") {
    const outputPath =
      message.payload.format === "html"
        ? await session.exportToHtml(message.payload.outputPath)
        : session.exportToJsonl(message.payload.outputPath)
    respond(message.requestId, { success: true, data: { outputPath } })
  } else if (message.type === "extension.ui.response") {
    const resolve = pendingExtensionRequests.get(
      message.payload.extensionRequestId
    )
    if (!resolve) {
      throw new Error(
        `Unknown extension UI request ${message.payload.extensionRequestId}.`
      )
    }
    resolve(message.payload.response)
    respond(message.requestId, { success: true })
  }
}

export function startWorker(
  agentModule: CodingAgentModule,
  terminalModule: TuiModule
) {
  codingAgent = agentModule
  tuiModule = terminalModule

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
}
