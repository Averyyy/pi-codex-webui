export const WEBUI_EXTENSION_API_VERSION = 1 as const
export const WEBUI_EXTENSION_PROTOCOL_VERSION = 1 as const

export type WebUiRuntime = "pi" | "pi-client"
export type WebUiPlacement =
  | "session.header"
  | "session.toolbar"
  | "conversation.before"
  | "conversation.after"
  | "composer.above"
  | "composer.actions"
  | "composer.below"
  | "session.rightPanel"
  | "session.dialog"
  | "session.overlay"

export interface WebUiExtensionTarget {
  packageName?: string
  extensionPath?: string
  version?: string
  testedVersions?: string[]
  compatibility?: {
    mode: "probe"
    onUntestedVersion: "allow-if-probe-passes" | "reject"
  }
}

export interface WebUiExtensionContribution {
  id: string
  name?: string
  target: WebUiExtensionTarget
  runtimes: WebUiRuntime[]
  worker: string
  client: string
  style?: string
  contributes: {
    commandAdapters?: Array<{ command: string; handler: string }>
    rendererAdapters?: Array<{
      kind: "tool" | "message" | "entry"
      name: string
      handler: string
    }>
  }
}

export interface PiWebCodexManifest {
  apiVersion: typeof WEBUI_EXTENSION_API_VERSION
  host: {
    version: string
    protocolVersion: typeof WEBUI_EXTENSION_PROTOCOL_VERSION
  }
  extensions: WebUiExtensionContribution[]
}

export interface ExtensionOwner {
  extensionPath: string
  resolvedPath: string
  sourceInfo: {
    source: string
    scope: "user" | "project" | "temporary"
    origin: "package" | "top-level"
    baseDir?: string
  }
  packageName?: string
  packageVersion?: string
}

export type ExtensionOperation =
  | { type: "command"; name: string }
  | { type: "event"; name: string }
  | { type: "shortcut"; name: string }
  | { type: "tool.execute"; name: string }
  | { type: "tool.renderCall"; name: string }
  | { type: "tool.renderResult"; name: string }
  | { type: "message.render"; customType: string }
  | { type: "entry.render"; customType: string }

export interface ExtensionInvocation {
  owner: ExtensionOwner
  operation: ExtensionOperation
}

export interface TargetCapabilities {
  owner: ExtensionOwner
  commands: ReadonlySet<string>
  tools: ReadonlySet<string>
  messageRenderers: ReadonlySet<string>
  entryRenderers: ReadonlySet<string>
}

export type CompatibilityProbeResult =
  { compatible: true } | { compatible: false; reason: string }

export interface OpenViewInput {
  viewId: string
  placement: WebUiPlacement
  state: unknown
  title?: string
  blocking?: boolean
}

export interface WorkerSessionApi {
  readonly cwd: string
  readonly sessionFile?: string
  listSessions(): Promise<WorkerSessionInfo[]>
  switchSession(sessionPath: string): Promise<{ cancelled: boolean }>
}

export interface WorkerSessionInfo {
  sessionPath: string
  id: string
  cwd: string
  name?: string
  createdAt: string
  updatedAt: string
  messageCount: number
  firstMessage: string
}

export interface WorkerCommandRequest {
  invocation: ExtensionInvocation
  args: string
}

export interface WorkerAdapterContext {
  readonly target: TargetCapabilities
  readonly session: WorkerSessionApi
  readonly signal: AbortSignal
  openView(input: OpenViewInput): Promise<unknown>
  updateView(instanceId: string, state: unknown, title?: string): void
  closeView(instanceId: string, result?: unknown): void
}

export interface CommandAdapterRegistration {
  id: string
  probe?(context: TargetCapabilities): CompatibilityProbeResult
  validate?(request: WorkerCommandRequest): CompatibilityProbeResult
  handle(
    request: WorkerCommandRequest,
    context: WorkerAdapterContext
  ):
    | Promise<{ handled: boolean; value?: unknown }>
    | { handled: boolean; value?: unknown }
}

export interface WorkerActionRequest {
  instanceId: string
  input?: unknown
}

export interface WorkerActionRegistration {
  id: string
  handle(
    request: WorkerActionRequest,
    context: WorkerAdapterContext
  ): Promise<unknown> | unknown
}

export interface RendererAdapterRequest {
  invocation: ExtensionInvocation
  payload: unknown
}

export interface RendererAdapterRegistration {
  id: string
  probe?(context: TargetCapabilities): CompatibilityProbeResult
  render(
    request: RendererAdapterRequest,
    context: WorkerAdapterContext
  ): OpenViewInput | undefined
}

export interface WorkerExtensionApi {
  registerCommandAdapter(adapter: CommandAdapterRegistration): void
  registerAction(action: WorkerActionRegistration): void
  registerRendererAdapter(adapter: RendererAdapterRegistration): void
}

export type WorkerExtensionInitializer = (
  web: WorkerExtensionApi
) => void | Promise<void>

export function defineWorkerExtension(
  initializer: WorkerExtensionInitializer
): WorkerExtensionInitializer {
  return initializer
}

export interface ClientViewMountContext {
  container: HTMLElement
  shadowRoot: ShadowRoot
  state: unknown
  signal: AbortSignal
  invoke(action: string, input?: unknown): Promise<unknown>
  close(result?: unknown): void
}

export interface ExternalViewRenderer {
  id: string
  mount(context: ClientViewMountContext): {
    update?(state: unknown): void
    dispose(): void
  }
}

export interface ClientExtensionApi {
  registerView(renderer: ExternalViewRenderer): void
}

export type ClientExtensionInitializer = (
  web: ClientExtensionApi
) => void | Promise<void>

export function defineClientExtension(
  initializer: ClientExtensionInitializer
): ClientExtensionInitializer {
  return initializer
}
