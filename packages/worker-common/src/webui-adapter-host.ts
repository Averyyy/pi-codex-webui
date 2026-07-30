import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import path, { matchesGlob } from "node:path"
import { pathToFileURL } from "node:url"

import type {
  CommandAdapterRegistration,
  CommandAdapterResult,
  ExtensionInvocation,
  ExtensionOwner,
  RendererAdapterRegistration,
  TargetCapabilities,
  ToolExecutionAdapterRegistration,
  ToolExecutionAdapterResult,
  ToolExecutionResult,
  WorkerActionRegistration,
  WorkerAdapterContext,
  WorkerExtensionApi,
  WorkerExtensionInitializer,
  WorkerSessionApi,
} from "@pi-web-codex/extension-sdk"
import type {
  Extension,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent"
import type {
  WebUiAdapterDescriptor,
  WebUiExtensionStatus,
  WebUiViewEvent,
  WebUiViewSnapshot,
} from "@workspace/runtime-protocol"
import { satisfies, valid, validRange } from "semver"

interface AdapterDefinition {
  commands: Map<string, CommandAdapterRegistration>
  toolExecutions: Map<string, ToolExecutionAdapterRegistration>
  actions: Map<string, WorkerActionRegistration>
  renderers: Map<string, RendererAdapterRegistration>
  controller: AbortController
}

interface LoadedAdapter {
  descriptor: WebUiAdapterDescriptor
  definition: AdapterDefinition
  targetExtension: Extension
  target: TargetCapabilities
  compatibility: "tested" | "compatible-by-probe"
}

interface Evaluation {
  loaded: LoadedAdapter[]
  state: "incompatible" | "unknown" | "error"
  reason: string
}

interface ViewRecord {
  snapshot: WebUiViewSnapshot
  adapter: LoadedAdapter
  context: WorkerAdapterContext
  upsertKey?: string
  activationTimeout?: NodeJS.Timeout
  resolve?: (value: unknown) => void
  reject?: (error: Error) => void
}

interface WebUiAdapterHostOptions {
  descriptors: WebUiAdapterDescriptor[]
  session: () => WorkerSessionApi
  emitView: (event: WebUiViewEvent) => void
  emitStatus: (status: WebUiExtensionStatus) => void
  emitTargetEvent: (name: string, payload: unknown) => void
  activationTimeoutMs?: number
}

const VIEW_ACTIVATION_TIMEOUT_MS = 10_000

function operationKey(resolvedPath: string, kind: string, name: string) {
  return `${resolvedPath}\0${kind}\0${name}`
}

function isToolExecutionResult(value: unknown): value is ToolExecutionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { content?: unknown }).content)
  )
}

function parseToolExecutionAdapterResult(
  value: unknown
): ToolExecutionAdapterResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Tool execution adapter must return an object.")
  }
  const result = value as {
    handled?: unknown
    result?: unknown
    params?: unknown
  }
  if (result.handled === true) {
    if (!isToolExecutionResult(result.result)) {
      throw new TypeError(
        "Handled tool execution adapter result must contain an array content result."
      )
    }
    return { handled: true, result: result.result }
  }
  if (result.handled === false) {
    return "params" in result
      ? { handled: false, params: result.params }
      : { handled: false }
  }
  throw new TypeError(
    "Tool execution adapter result must declare handled as a boolean."
  )
}

function rendererKind(invocation: ExtensionInvocation) {
  if (
    invocation.operation.type === "tool.renderCall" ||
    invocation.operation.type === "tool.renderResult"
  ) {
    return { kind: "tool", name: invocation.operation.name }
  }
  if (invocation.operation.type === "message.render") {
    return { kind: "message", name: invocation.operation.customType }
  }
  if (invocation.operation.type === "entry.render") {
    return { kind: "entry", name: invocation.operation.customType }
  }
  if (invocation.operation.type === "status.render") {
    return { kind: "status", name: invocation.operation.key }
  }
  return null
}

async function packageIdentity(extension: Extension) {
  if (
    extension.sourceInfo.origin !== "package" ||
    extension.resolvedPath.startsWith("<")
  ) {
    return {}
  }
  let directory = path.dirname(extension.resolvedPath)
  while (true) {
    try {
      const value = JSON.parse(
        await readFile(path.join(directory, "package.json"), "utf8")
      ) as { name?: unknown; version?: unknown }
      if (typeof value.name === "string" && typeof value.version === "string") {
        return { packageName: value.name, packageVersion: value.version }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const parent = path.dirname(directory)
    if (parent === directory) return {}
    directory = parent
  }
}

function matchesTarget(
  descriptor: WebUiAdapterDescriptor,
  owner: ExtensionOwner
) {
  const target = descriptor.extension.target
  if (target.packageName && target.packageName !== owner.packageName) {
    return false
  }
  if (!target.extensionPath) return true
  const pattern = target.extensionPath.replaceAll("\\", "/")
  const paths = [owner.resolvedPath]
  if (owner.sourceInfo.baseDir) {
    paths.push(path.relative(owner.sourceInfo.baseDir, owner.resolvedPath))
  }
  return paths.some((candidate) =>
    matchesGlob(candidate.replaceAll("\\", "/"), pattern)
  )
}

function targetCapabilities(extension: Extension, owner: ExtensionOwner) {
  return {
    owner,
    commands: new Set(extension.commands.keys()),
    tools: new Set(extension.tools.keys()),
    messageRenderers: new Set(extension.messageRenderers.keys()),
    entryRenderers: new Set(extension.entryRenderers?.keys() ?? []),
  } satisfies TargetCapabilities
}

function manifestCapabilitiesMatch(
  descriptor: WebUiAdapterDescriptor,
  target: TargetCapabilities
) {
  for (const command of descriptor.extension.contributes.commandAdapters ??
    []) {
    if (!target.commands.has(command.command)) {
      return `Missing target command: ${command.command}`
    }
  }
  for (const tool of descriptor.extension.contributes.toolExecutionAdapters ??
    []) {
    if (!target.tools.has(tool.tool)) {
      return `Missing target tool: ${tool.tool}`
    }
  }
  for (const renderer of descriptor.extension.contributes.rendererAdapters ??
    []) {
    if (renderer.kind === "status") continue
    const available =
      renderer.kind === "tool"
        ? target.tools
        : renderer.kind === "message"
          ? target.messageRenderers
          : target.entryRenderers
    if (!available.has(renderer.name)) {
      return `Missing target ${renderer.kind} renderer: ${renderer.name}`
    }
  }
  return null
}

async function loadDefinition(descriptor: WebUiAdapterDescriptor) {
  const commands = new Map<string, CommandAdapterRegistration>()
  const toolExecutions = new Map<string, ToolExecutionAdapterRegistration>()
  const actions = new Map<string, WorkerActionRegistration>()
  const renderers = new Map<string, RendererAdapterRegistration>()
  const register = <T extends { id: string }>(
    map: Map<string, T>,
    value: T
  ) => {
    if (map.has(value.id)) {
      throw new Error(`Duplicate adapter registration: ${value.id}`)
    }
    map.set(value.id, value)
  }
  const api: WorkerExtensionApi = {
    registerCommandAdapter: (adapter) => register(commands, adapter),
    registerToolExecutionAdapter: (adapter) =>
      register(toolExecutions, adapter),
    registerAction: (action) => register(actions, action),
    registerRendererAdapter: (renderer) => register(renderers, renderer),
  }
  const modified = (await stat(descriptor.workerPath)).mtimeMs
  const imported = (await import(
    `${pathToFileURL(descriptor.workerPath).href}?mtime=${modified}`
  )) as { default?: unknown }
  if (typeof imported.default !== "function") {
    throw new Error("Adapter worker must export a default initializer.")
  }
  await (imported.default as WorkerExtensionInitializer)(api)
  for (const contribution of descriptor.extension.contributes.commandAdapters ??
    []) {
    if (!commands.has(contribution.handler)) {
      throw new Error(
        `Missing command adapter handler: ${contribution.handler}`
      )
    }
  }
  for (const contribution of descriptor.extension.contributes
    .toolExecutionAdapters ?? []) {
    if (!toolExecutions.has(contribution.handler)) {
      throw new Error(
        `Missing tool execution adapter handler: ${contribution.handler}`
      )
    }
  }
  for (const contribution of descriptor.extension.contributes
    .rendererAdapters ?? []) {
    if (!renderers.has(contribution.handler)) {
      throw new Error(
        `Missing renderer adapter handler: ${contribution.handler}`
      )
    }
  }
  return {
    commands,
    toolExecutions,
    actions,
    renderers,
    controller: new AbortController(),
  }
}

export class WebUiAdapterHost {
  private readonly owners = new Map<string, ExtensionOwner>()
  private readonly views = new Map<string, ViewRecord>()
  private readonly commands = new Map<
    string,
    { adapter: LoadedAdapter; registration: CommandAdapterRegistration }
  >()
  private readonly toolExecutions = new Map<
    string,
    { adapter: LoadedAdapter; registration: ToolExecutionAdapterRegistration }
  >()
  private readonly renderers = new Map<
    string,
    { adapter: LoadedAdapter; registration: RendererAdapterRegistration }
  >()
  private readonly messageRendererOwners = new Map<
    string,
    Map<string, ExtensionOwner>
  >()
  private readonly statusViews = new Map<string, string>()
  private readonly upsertViews = new Map<string, string>()
  private readonly targetToolInvocations = new AsyncLocalStorage<Set<string>>()
  private definitions: AdapterDefinition[] = []

  constructor(private readonly options: WebUiAdapterHostOptions) {}

  owner(extension: Extension): ExtensionOwner {
    return (
      this.owners.get(extension.resolvedPath) ?? {
        extensionPath: extension.path,
        resolvedPath: extension.resolvedPath,
        sourceInfo: {
          source: extension.sourceInfo.source,
          scope: extension.sourceInfo.scope,
          origin: extension.sourceInfo.origin,
          ...(extension.sourceInfo.baseDir
            ? { baseDir: extension.sourceInfo.baseDir }
            : {}),
        },
      }
    )
  }

  async initialize(extensions: Extension[]) {
    this.dispose()
    const ownerEntries = await Promise.all(
      extensions.map(async (extension) => {
        const identity = await packageIdentity(extension)
        return [
          extension.resolvedPath,
          {
            extensionPath: extension.path,
            resolvedPath: extension.resolvedPath,
            sourceInfo: {
              source: extension.sourceInfo.source,
              scope: extension.sourceInfo.scope,
              origin: extension.sourceInfo.origin,
              ...(extension.sourceInfo.baseDir
                ? { baseDir: extension.sourceInfo.baseDir }
                : {}),
            },
            ...identity,
          },
        ] as const
      })
    )
    for (const [resolvedPath, owner] of ownerEntries) {
      this.owners.set(resolvedPath, owner)
    }

    const evaluations = new Map<string, Evaluation>()
    for (const descriptor of this.options.descriptors) {
      evaluations.set(
        descriptor.key,
        await this.evaluate(descriptor, extensions)
      )
    }
    for (const extensionId of new Set(
      this.options.descriptors.map((descriptor) => descriptor.extension.id)
    )) {
      this.select(extensionId, evaluations)
    }
  }

  private async evaluate(
    descriptor: WebUiAdapterDescriptor,
    extensions: Extension[]
  ): Promise<Evaluation> {
    if (!descriptor.preference.enabled) {
      return { loaded: [], state: "incompatible", reason: "Adapter disabled." }
    }
    if (descriptor.preference.rendering === "tui") {
      return { loaded: [], state: "incompatible", reason: "TUI preferred." }
    }
    try {
      const targets = extensions.filter((extension) =>
        matchesTarget(descriptor, this.owner(extension))
      )
      if (!targets.length) {
        return {
          loaded: [],
          state: "incompatible",
          reason: "Target Pi extension is not loaded.",
        }
      }
      const compatibleTargets: Array<{
        targetExtension: Extension
        target: TargetCapabilities
        compatibility: LoadedAdapter["compatibility"]
      }> = []
      let lastReason = "Target is incompatible."
      let unknown = false
      for (const targetExtension of targets) {
        const target = targetCapabilities(
          targetExtension,
          this.owner(targetExtension)
        )
        const missing = manifestCapabilitiesMatch(descriptor, target)
        if (missing) {
          lastReason = missing
          continue
        }
        const packageVersion = target.owner.packageVersion
        const supportedVersion = descriptor.extension.target.version
        if (supportedVersion) {
          if (!validRange(supportedVersion)) {
            throw new Error(`Invalid target version range: ${supportedVersion}`)
          }
          if (!packageVersion || !valid(packageVersion)) {
            unknown = true
            lastReason = "Target package version is unavailable."
            continue
          }
          if (!satisfies(packageVersion, supportedVersion)) {
            lastReason = `Target ${packageVersion} is outside ${supportedVersion}.`
            continue
          }
        }
        const tested = Boolean(
          packageVersion &&
          descriptor.extension.target.testedVersions?.includes(packageVersion)
        )
        if (
          !tested &&
          descriptor.extension.target.testedVersions?.length &&
          descriptor.extension.target.compatibility?.onUntestedVersion ===
            "reject"
        ) {
          lastReason = `Target ${packageVersion ?? "unknown"} was not tested.`
          continue
        }
        compatibleTargets.push({
          targetExtension,
          target,
          compatibility: tested ? "tested" : "compatible-by-probe",
        })
      }
      if (!compatibleTargets.length) {
        return {
          loaded: [],
          state: unknown ? "unknown" : "incompatible",
          reason: lastReason,
        }
      }
      const definition = await loadDefinition(descriptor)
      this.definitions.push(definition)
      const loaded: LoadedAdapter[] = []
      for (const candidate of compatibleTargets) {
        let probeFailure: string | undefined
        for (const contribution of descriptor.extension.contributes
          .commandAdapters ?? []) {
          const probe = definition.commands
            .get(contribution.handler)
            ?.probe?.(candidate.target)
          if (probe && !probe.compatible) {
            probeFailure = probe.reason
            break
          }
        }
        if (!probeFailure) {
          for (const contribution of descriptor.extension.contributes
            .toolExecutionAdapters ?? []) {
            const probe = definition.toolExecutions
              .get(contribution.handler)
              ?.probe?.(candidate.target)
            if (probe && !probe.compatible) {
              probeFailure = probe.reason
              break
            }
          }
        }
        if (!probeFailure) {
          for (const contribution of descriptor.extension.contributes
            .rendererAdapters ?? []) {
            const probe = definition.renderers
              .get(contribution.handler)
              ?.probe?.(candidate.target)
            if (probe && !probe.compatible) {
              probeFailure = probe.reason
              break
            }
          }
        }
        if (probeFailure) {
          lastReason = probeFailure
          continue
        }
        loaded.push({
          descriptor,
          definition,
          ...candidate,
        })
      }
      return loaded.length
        ? { loaded, state: "incompatible", reason: "" }
        : {
            loaded,
            state: unknown ? "unknown" : "incompatible",
            reason: lastReason,
          }
    } catch (error) {
      return {
        loaded: [],
        state: "error",
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private select(extensionId: string, evaluations: Map<string, Evaluation>) {
    const descriptors = this.options.descriptors.filter(
      (descriptor) => descriptor.extension.id === extensionId
    )
    const preference = descriptors[0]?.preference
    if (!preference?.enabled) {
      this.emitStatus(extensionId, "disabled", undefined, "Adapter disabled.")
      return
    }
    if (preference.rendering === "tui") {
      this.emitStatus(extensionId, "tui", undefined, "TUI preferred.")
      return
    }
    const compatible = descriptors.flatMap(
      (descriptor) => evaluations.get(descriptor.key)?.loaded ?? []
    )
    let selectedKey = preference.selectedAdapter
    if (selectedKey) {
      if (
        !compatible.some((adapter) => adapter.descriptor.key === selectedKey)
      ) {
        this.emitStatus(
          extensionId,
          "incompatible",
          undefined,
          "The selected adapter is not compatible."
        )
        return
      }
    } else {
      const external = new Set(
        compatible
          .filter((adapter) => adapter.descriptor.source !== "builtin")
          .map((adapter) => adapter.descriptor.key)
      )
      const builtin = new Set(
        compatible
          .filter((adapter) => adapter.descriptor.source === "builtin")
          .map((adapter) => adapter.descriptor.key)
      )
      const candidates = external.size ? external : builtin
      if (candidates.size > 1) {
        this.emitStatus(
          extensionId,
          "conflict",
          undefined,
          "Multiple compatible adapters require an explicit selection."
        )
        return
      }
      selectedKey = candidates.values().next().value ?? null
    }
    if (!selectedKey) {
      const evaluationsForId = descriptors.map((descriptor) =>
        evaluations.get(descriptor.key)
      )
      const state = evaluationsForId.some((entry) => entry?.state === "error")
        ? "error"
        : evaluationsForId.some((entry) => entry?.state === "unknown")
          ? "unknown"
          : "incompatible"
      const reason = evaluationsForId.find((entry) => entry?.reason)?.reason
      this.emitStatus(extensionId, state, undefined, reason)
      return
    }
    const selected = compatible.filter(
      (adapter) => adapter.descriptor.key === selectedKey
    )
    for (const adapter of selected) this.bind(adapter)
    const first = selected[0]
    if (!first) return
    this.options.emitStatus({
      version: 1,
      extensionId,
      adapterKey: selectedKey,
      state: first.compatibility,
      targetPackageName: first.target.owner.packageName,
      targetPackageVersion: first.target.owner.packageVersion,
      supportedVersion: first.descriptor.extension.target.version,
      testedVersions: first.descriptor.extension.target.testedVersions,
      probePassed: true,
    })
  }

  private emitStatus(
    extensionId: string,
    state: WebUiExtensionStatus["state"],
    adapterKey?: string,
    reason?: string
  ) {
    this.options.emitStatus({
      version: 1,
      extensionId,
      state,
      adapterKey,
      reason,
    })
  }

  private bind(adapter: LoadedAdapter) {
    const path = adapter.target.owner.resolvedPath
    for (const contribution of adapter.descriptor.extension.contributes
      .commandAdapters ?? []) {
      const registration = adapter.definition.commands.get(contribution.handler)
      if (!registration) continue
      this.commands.set(operationKey(path, "command", contribution.command), {
        adapter,
        registration,
      })
    }
    for (const contribution of adapter.descriptor.extension.contributes
      .toolExecutionAdapters ?? []) {
      const registration = adapter.definition.toolExecutions.get(
        contribution.handler
      )
      if (!registration) continue
      this.toolExecutions.set(
        operationKey(path, "tool.execute", contribution.tool),
        { adapter, registration }
      )
    }
    for (const contribution of adapter.descriptor.extension.contributes
      .rendererAdapters ?? []) {
      const registration = adapter.definition.renderers.get(
        contribution.handler
      )
      if (!registration) continue
      this.renderers.set(
        operationKey(path, contribution.kind, contribution.name),
        { adapter, registration }
      )
      if (contribution.kind === "message") {
        const owners =
          this.messageRendererOwners.get(contribution.name) ??
          new Map<string, ExtensionOwner>()
        owners.set(path, adapter.target.owner)
        this.messageRendererOwners.set(contribution.name, owners)
      }
    }
  }

  private context(
    adapter: LoadedAdapter,
    extensionContext?: ExtensionContext,
    session = this.options.session(),
    onSideEffect?: () => void
  ): WorkerAdapterContext {
    const context: WorkerAdapterContext = {
      target: adapter.target,
      session,
      signal: adapter.definition.controller.signal,
      openView: (input) => {
        onSideEffect?.()
        return this.openView(adapter, context, input)
      },
      updateView: (instanceId, state, title) => {
        onSideEffect?.()
        this.updateView(adapter.descriptor.key, instanceId, state, title)
      },
      closeView: (instanceId, result) => {
        onSideEffect?.()
        this.closeView(adapter.descriptor.key, instanceId, result)
      },
      invokeTargetTool: (name, params) => {
        onSideEffect?.()
        return this.invokeTargetTool(adapter, extensionContext, name, params)
      },
      emitTargetEvent: (name, payload) => {
        onSideEffect?.()
        this.options.emitTargetEvent(name, payload)
      },
    }
    return context
  }

  private async invokeTargetTool(
    adapter: LoadedAdapter,
    extensionContext: ExtensionContext | undefined,
    name: string,
    params: unknown
  ): Promise<ToolExecutionResult> {
    if (!extensionContext) {
      throw new Error(
        "Target tools require the target extension context captured when the view opened."
      )
    }
    const tool = adapter.targetExtension.tools.get(name)
    if (!tool) {
      throw new Error(`Target extension does not register tool ${name}.`)
    }
    const key = operationKey(
      adapter.target.owner.resolvedPath,
      "tool.execute",
      name
    )
    const active = this.targetToolInvocations.getStore()
    const nested = new Set(active)
    nested.add(key)
    const prepared = tool.definition.prepareArguments?.(params) ?? params
    const result = await this.targetToolInvocations.run(nested, () =>
      tool.definition.execute(
        randomUUID(),
        prepared as never,
        extensionContext.signal,
        undefined,
        extensionContext
      )
    )
    if (!isToolExecutionResult(result)) {
      throw new TypeError(
        `Target tool ${name} returned a result without array content.`
      )
    }
    return result
  }

  async tryHandleCommand(
    invocation: ExtensionInvocation,
    args: string,
    commandContext: ExtensionCommandContext
  ): Promise<CommandAdapterResult> {
    if (invocation.operation.type !== "command") return { handled: false }
    const selected = this.commands.get(
      operationKey(
        invocation.owner.resolvedPath,
        "command",
        invocation.operation.name
      )
    )
    if (!selected) return { handled: false }
    const baseSession = this.options.session()
    const context = this.context(selected.adapter, commandContext, {
      ...baseSession,
      cwd: commandContext.cwd,
      sessionFile: commandContext.sessionManager.getSessionFile(),
      switchSession: (sessionPath) => commandContext.switchSession(sessionPath),
    })
    const request = { invocation, args }
    try {
      const validation = selected.registration.validate?.(request)
      if (validation && !validation.compatible) {
        this.emitStatus(
          selected.adapter.descriptor.extension.id,
          "incompatible",
          selected.adapter.descriptor.key,
          validation.reason
        )
        return { handled: false }
      }
      const existingViews = new Set(this.views.keys())
      const result = await selected.registration.handle(request, context)
      if (!result.handled) {
        for (const instanceId of this.views.keys()) {
          if (!existingViews.has(instanceId)) this.finishView(instanceId)
        }
      }
      return result
    } catch (error) {
      this.failAdapter(selected.adapter, error)
      return { handled: false }
    }
  }

  async tryHandleToolExecution(
    invocation: ExtensionInvocation,
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    extensionContext: ExtensionContext
  ): Promise<ToolExecutionAdapterResult> {
    if (invocation.operation.type !== "tool.execute") {
      return { handled: false }
    }
    const key = operationKey(
      invocation.owner.resolvedPath,
      "tool.execute",
      invocation.operation.name
    )
    if (this.targetToolInvocations.getStore()?.has(key)) {
      return { handled: false }
    }
    const selected = this.toolExecutions.get(key)
    if (!selected) return { handled: false }
    const request = { invocation, toolCallId, params, signal }
    let sideEffectOccurred = false
    try {
      const validation = selected.registration.validate?.(request)
      if (validation && !validation.compatible) {
        this.emitStatus(
          selected.adapter.descriptor.extension.id,
          "incompatible",
          selected.adapter.descriptor.key,
          validation.reason
        )
        return { handled: false }
      }
      const existingViews = new Set(this.views.keys())
      const result = parseToolExecutionAdapterResult(
        await selected.registration.execute(
          request,
          this.context(
            selected.adapter,
            extensionContext,
            undefined,
            () => (sideEffectOccurred = true)
          )
        )
      )
      if (!result.handled) {
        for (const instanceId of this.views.keys()) {
          if (!existingViews.has(instanceId)) this.finishView(instanceId)
        }
      }
      return result
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      this.failAdapter(selected.adapter, failure)
      if (sideEffectOccurred) {
        return {
          handled: true,
          result: {
            content: [
              {
                type: "text",
                text: `WebUI adapter failed after producing side effects: ${failure.message}`,
              },
            ],
            isError: true,
          },
        }
      }
      return { handled: false }
    }
  }

  tryRender(
    invocation: ExtensionInvocation,
    payload: unknown,
    extensionContext?: ExtensionContext,
    replacesEntry?: WebUiViewSnapshot["replacesEntry"]
  ) {
    const renderer = rendererKind(invocation)
    if (!renderer) return
    const selected = this.renderers.get(
      operationKey(invocation.owner.resolvedPath, renderer.kind, renderer.name)
    )
    if (!selected) return
    try {
      const context = this.context(selected.adapter, extensionContext)
      const view = selected.registration.render(
        { invocation, payload },
        context
      )
      if (renderer.kind === "status") {
        const key = operationKey(
          invocation.owner.resolvedPath,
          renderer.kind,
          renderer.name
        )
        const existingId = this.statusViews.get(key)
        if (!view) {
          if (existingId) this.finishView(existingId)
          this.statusViews.delete(key)
          return
        }
        if (existingId && this.views.has(existingId)) {
          this.updateView(
            selected.adapter.descriptor.key,
            existingId,
            view.state,
            view.title
          )
          return
        }
        const opened = this.openView(
          selected.adapter,
          context,
          {
            ...view,
            blocking: false,
          },
          replacesEntry
        )
        void Promise.resolve(opened).then((instanceId) => {
          if (typeof instanceId === "string")
            this.statusViews.set(key, instanceId)
        })
        return
      }
      if (view)
        void this.openView(
          selected.adapter,
          context,
          {
            ...view,
            blocking: false,
          },
          replacesEntry
        )
    } catch (error) {
      this.failAdapter(selected.adapter, error)
    }
  }

  tryRenderMessage(
    customType: string,
    message: unknown,
    replacesEntry: NonNullable<WebUiViewSnapshot["replacesEntry"]>
  ) {
    for (const owner of this.messageRendererOwners.get(customType)?.values() ??
      []) {
      this.tryRender(
        {
          owner,
          operation: { type: "message.render", customType },
        },
        { message, options: { expanded: false } },
        undefined,
        replacesEntry
      )
    }
  }

  private openView(
    adapter: LoadedAdapter,
    context: WorkerAdapterContext,
    input: Parameters<WorkerAdapterContext["openView"]>[0],
    replacesEntry?: WebUiViewSnapshot["replacesEntry"]
  ) {
    let upsertKey: string | undefined
    if (input.upsertKey !== undefined) {
      if (!input.upsertKey) {
        throw new Error("WebUI view upsertKey must not be empty.")
      }
      if (input.blocking) {
        throw new Error("Blocking WebUI views cannot use upsertKey.")
      }
      upsertKey = operationKey(
        adapter.descriptor.key,
        "view.upsert",
        input.upsertKey
      )
      const existingId = this.upsertViews.get(upsertKey)
      const existing = existingId ? this.views.get(existingId) : undefined
      if (existing) {
        if (
          existing.snapshot.viewId !== input.viewId ||
          existing.snapshot.placement !== input.placement
        ) {
          throw new Error(
            `WebUI view upsertKey ${input.upsertKey} changed view identity.`
          )
        }
        this.updateView(
          adapter.descriptor.key,
          existing.snapshot.instanceId,
          input.state,
          input.title
        )
        return Promise.resolve(existing.snapshot.instanceId)
      }
      this.upsertViews.delete(upsertKey)
    }
    const instanceId = randomUUID()
    const snapshot: WebUiViewSnapshot = {
      version: 1,
      extensionId: adapter.descriptor.extension.id,
      adapterKey: adapter.descriptor.key,
      viewId: input.viewId,
      instanceId,
      placement: input.placement,
      revision: 0,
      state: input.state,
      title: input.title,
      blocking: input.blocking ?? false,
      ...(replacesEntry ? { replacesEntry } : {}),
    }
    let resolve: ((value: unknown) => void) | undefined
    let reject: ((error: Error) => void) | undefined
    const result = snapshot.blocking
      ? new Promise<unknown>((accept, fail) => {
          resolve = accept
          reject = fail
        })
      : Promise.resolve(instanceId)
    const activationTimeout = snapshot.blocking
      ? setTimeout(() => {
          const error = new Error(
            "Adapter client did not mount before the activation timeout."
          )
          this.failView(instanceId, error)
          this.failAdapter(adapter, error)
        }, this.options.activationTimeoutMs ?? VIEW_ACTIVATION_TIMEOUT_MS)
      : undefined
    this.views.set(instanceId, {
      snapshot,
      adapter,
      context,
      upsertKey,
      activationTimeout,
      resolve,
      reject,
    })
    if (upsertKey) this.upsertViews.set(upsertKey, instanceId)
    this.options.emitView({ version: 1, kind: "open", view: snapshot })
    return result
  }

  private updateView(
    adapterKey: string,
    instanceId: string,
    state: unknown,
    title?: string
  ) {
    const view = this.ownedView(adapterKey, instanceId)
    view.snapshot = {
      ...view.snapshot,
      revision: view.snapshot.revision + 1,
      state,
      title: title ?? view.snapshot.title,
    }
    this.options.emitView({ version: 1, kind: "update", view: view.snapshot })
  }

  private closeView(adapterKey: string, instanceId: string, result?: unknown) {
    this.ownedView(adapterKey, instanceId)
    this.finishView(instanceId, result)
  }

  private ownedView(adapterKey: string, instanceId: string) {
    const view = this.views.get(instanceId)
    if (!view || view.adapter.descriptor.key !== adapterKey) {
      throw new Error(`Adapter does not own WebUI view ${instanceId}.`)
    }
    return view
  }

  private finishView(instanceId: string, result?: unknown) {
    const view = this.views.get(instanceId)
    if (!view) return
    this.views.delete(instanceId)
    this.removeStatusView(instanceId)
    this.removeUpsertView(view)
    clearTimeout(view.activationTimeout)
    this.options.emitView({
      version: 1,
      kind: "close",
      extensionId: view.snapshot.extensionId,
      instanceId,
    })
    view.resolve?.(result)
  }

  private failView(instanceId: string, error: Error) {
    const view = this.views.get(instanceId)
    if (!view) return
    this.views.delete(instanceId)
    this.removeStatusView(instanceId)
    this.removeUpsertView(view)
    clearTimeout(view.activationTimeout)
    this.options.emitView({
      version: 1,
      kind: "close",
      extensionId: view.snapshot.extensionId,
      instanceId,
    })
    view.reject?.(error)
  }

  private failAdapter(adapter: LoadedAdapter, error: unknown) {
    const failure = error instanceof Error ? error : new Error(String(error))
    for (const [instanceId, view] of this.views) {
      if (view.adapter.descriptor.key === adapter.descriptor.key) {
        this.failView(instanceId, failure)
      }
    }
    this.emitStatus(
      adapter.descriptor.extension.id,
      "error",
      adapter.descriptor.key,
      failure.message
    )
  }

  private removeStatusView(instanceId: string) {
    for (const [key, value] of this.statusViews) {
      if (value === instanceId) this.statusViews.delete(key)
    }
  }

  private removeUpsertView(view: ViewRecord) {
    if (
      view.upsertKey &&
      this.upsertViews.get(view.upsertKey) === view.snapshot.instanceId
    ) {
      this.upsertViews.delete(view.upsertKey)
    }
  }

  snapshots() {
    return [...this.views.values()].map((view) => view.snapshot)
  }

  private actionContext(view: ViewRecord): WorkerAdapterContext {
    const instanceId = view.snapshot.instanceId
    const isCurrent = () => this.views.get(instanceId) === view
    return {
      ...view.context,
      updateView: (targetInstanceId, state, title) => {
        if (targetInstanceId === instanceId && !isCurrent()) return
        view.context.updateView(targetInstanceId, state, title)
      },
      closeView: (targetInstanceId, result) => {
        if (targetInstanceId === instanceId && !isCurrent()) return
        view.context.closeView(targetInstanceId, result)
      },
    }
  }

  async action(
    extensionId: string,
    instanceId: string,
    actionId: string,
    input?: unknown
  ) {
    const view = this.views.get(instanceId)
    if (!view || view.snapshot.extensionId !== extensionId) {
      throw new Error(`Unknown WebUI view ${instanceId}.`)
    }
    if (actionId === "__close") {
      this.finishView(instanceId, input)
      return
    }
    const action = view.adapter.definition.actions.get(actionId)
    if (!action) throw new Error(`Unknown adapter action ${actionId}.`)
    try {
      return await action.handle(
        { instanceId, input },
        this.actionContext(view)
      )
    } catch (error) {
      this.failAdapter(view.adapter, error)
      throw error
    }
  }

  clientStatus(
    extensionId: string,
    instanceId: string,
    status: "ready" | "error" | "disposed",
    message?: string
  ) {
    const view = this.views.get(instanceId)
    if (!view || view.snapshot.extensionId !== extensionId) return
    if (status === "ready") {
      clearTimeout(view.activationTimeout)
      return
    }
    if (status === "disposed" && !view.snapshot.blocking) return
    const error = new Error(message ?? `Adapter client ${status}.`)
    this.failView(instanceId, error)
    this.failAdapter(view.adapter, error)
  }

  dispose() {
    for (const instanceId of [...this.views.keys()]) {
      this.failView(instanceId, new Error("Adapter host was disposed."))
    }
    for (const definition of this.definitions) definition.controller.abort()
    this.definitions = []
    this.commands.clear()
    this.toolExecutions.clear()
    this.renderers.clear()
    this.messageRendererOwners.clear()
    this.statusViews.clear()
    this.upsertViews.clear()
    this.owners.clear()
  }
}
