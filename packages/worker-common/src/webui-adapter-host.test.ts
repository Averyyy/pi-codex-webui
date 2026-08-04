import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import type {
  Extension,
  ExtensionCommandContext,
  ExtensionContext,
  LoadExtensionsResult,
} from "@earendil-works/pi-coding-agent"
import type {
  WebUiAdapterDescriptor,
  WebUiExtensionStatus,
  WebUiViewEvent,
} from "@workspace/runtime-protocol"

import { createExtensionInstrumentor } from "./extension-instrumentation.js"
import { WebUiAdapterHost } from "./webui-adapter-host.js"

async function fixture(workerSource: string) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-webui-worker-"))
  const targetRoot = path.join(root, ".pi", "node_modules", "pi-target")
  await mkdir(targetRoot, { recursive: true })
  const targetPath = path.join(targetRoot, "index.js")
  const workerPath = path.join(root, "adapter.mjs")
  await Promise.all([
    writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify({ name: "pi-target", version: "1.1.0" })
    ),
    writeFile(targetPath, "export default () => {}\n"),
    writeFile(workerPath, workerSource),
  ])
  return { root, targetPath, workerPath }
}

function descriptor(
  workerPath: string,
  options: {
    key?: string
    source?: WebUiAdapterDescriptor["source"]
    contributes?: WebUiAdapterDescriptor["extension"]["contributes"]
  } = {}
): WebUiAdapterDescriptor {
  return {
    key: options.key ?? "external:pi-target-webui#target",
    source: options.source ?? "external",
    packageName: "pi-target-webui",
    packageVersion: "1.0.0",
    extension: {
      id: "target",
      name: "Target Web UI",
      target: {
        packageName: "pi-target",
        extensionPath: "**/index.js",
        version: ">=1.0.0 <2.0.0",
        testedVersions: ["1.0.0"],
        compatibility: {
          mode: "probe",
          onUntestedVersion: "allow-if-probe-passes",
        },
      },
      runtimes: ["pi"],
      worker: "./dist/worker.mjs",
      client: "./dist/client.mjs",
      contributes: options.contributes ?? {
        commandAdapters: [{ command: "target", handler: "target.open" }],
      },
    },
    workerPath,
    preference: {
      enabled: true,
      rendering: "native",
      selectedAdapter: null,
    },
  }
}

function extension(
  targetPath: string,
  original: (args: string) => void
): Extension {
  return {
    path: targetPath,
    resolvedPath: targetPath,
    sourceInfo: {
      source: "pi-target",
      scope: "user",
      origin: "package",
      baseDir: path.dirname(targetPath),
    },
    handlers: new Map(),
    commands: new Map([
      [
        "target",
        {
          description: "Target command",
          handler: async (args: string) => original(args),
        },
      ],
    ]),
    shortcuts: new Map(),
    tools: new Map(),
    messageRenderers: new Map(),
    entryRenderers: new Map(),
  } as unknown as Extension
}

function commandContext(): ExtensionCommandContext {
  return {
    cwd: "/tmp/project",
    sessionManager: { getSessionFile: () => "/tmp/session.jsonl" },
    switchSession: async () => ({ cancelled: false }),
  } as unknown as ExtensionCommandContext
}

function registerTool(
  target: Extension,
  name: string,
  execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    context: ExtensionContext
  ) => Promise<unknown>
) {
  target.tools.set(name, {
    definition: {
      name,
      description: `${name} tool`,
      parameters: {},
      execute,
    },
  } as never)
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

test("command adapter errors execute the original Pi command", async () => {
  const files = await fixture(`
    export default (web) => web.registerCommandAdapter({
      id: "target.open",
      probe: () => ({ compatible: true }),
      handle: () => { throw new Error("adapter failed") }
    })
  `)
  const statuses: WebUiExtensionStatus[] = []
  let originalCalls = 0
  const target = extension(files.targetPath, () => (originalCalls += 1))
  const host = new WebUiAdapterHost({
    descriptors: [descriptor(files.workerPath)],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.commands.get("target")?.handler("", commandContext())
    assert.equal(originalCalls, 1)
    assert.equal(statuses[0]?.state, "compatible-by-probe")
    assert.equal(statuses.at(-1)?.state, "error")
    assert.match(statuses.at(-1)?.reason ?? "", /adapter failed/)
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("command adapters can rewrite arguments for the original command", async () => {
  const files = await fixture(`
    export default (web) => web.registerCommandAdapter({
      id: "target.open",
      handle: () => ({ handled: false, args: "fast" })
    })
  `)
  let originalArgs: string | undefined
  const target = extension(files.targetPath, (args) => (originalArgs = args))
  const host = new WebUiAdapterHost({
    descriptors: [descriptor(files.workerPath)],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: () => {},
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.commands.get("target")?.handler("", commandContext())
    assert.equal(originalArgs, "fast")
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("a built-in adapter worker is not imported when its target is absent", async () => {
  const files = await fixture(`throw new Error("worker must not load")`)
  const statuses: WebUiExtensionStatus[] = []
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        key: "builtin:pi-target-webui#target",
        source: "builtin",
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  try {
    await host.initialize([])
    assert.equal(statuses.at(-1)?.state, "incompatible")
    assert.equal(statuses.at(-1)?.reason, "Target Pi extension is not loaded.")
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("a blocking view waits for a client before reporting a mount failure", async (context) => {
  const files = await fixture(`
    export default (web) => web.registerCommandAdapter({
      id: "target.open",
      probe: () => ({ compatible: true }),
      async handle(_request, context) {
        await context.openView({
          viewId: "target.dialog",
          placement: "session.dialog",
          blocking: true,
          state: {}
        })
        return { handled: true }
      }
    })
  `)
  const events: WebUiViewEvent[] = []
  let originalCalls = 0
  const target = extension(files.targetPath, () => (originalCalls += 1))
  const host = new WebUiAdapterHost({
    descriptors: [descriptor(files.workerPath)],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: () => {},
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    context.mock.timers.enable({ apis: ["setTimeout"] })
    const pending = target.commands.get("target")?.handler("", commandContext())
    await Promise.resolve()
    const view = host.snapshots()[0]
    assert.ok(view)

    context.mock.timers.tick(10_001)
    await Promise.resolve()
    assert.equal(originalCalls, 0)
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open"]
    )

    host.clientStatus("target", view.instanceId, "error", "client mount failed")
    await pending
    assert.equal(originalCalls, 1)
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open", "close"]
    )
    assert.deepEqual(host.snapshots(), [])
  } finally {
    context.mock.timers.reset()
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("a mounted blocking view survives client disposal and remounts", async () => {
  const files = await fixture(`
    export default (web) => web.registerCommandAdapter({
      id: "target.open",
      probe: () => ({ compatible: true }),
      async handle(_request, context) {
        await context.openView({
          viewId: "target.dialog",
          placement: "session.dialog",
          blocking: true,
          state: {}
        })
        return { handled: true }
      }
    })
  `)
  const events: WebUiViewEvent[] = []
  const statuses: WebUiExtensionStatus[] = []
  let originalCalls = 0
  const target = extension(files.targetPath, () => (originalCalls += 1))
  const host = new WebUiAdapterHost({
    descriptors: [descriptor(files.workerPath)],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    const pending = target.commands.get("target")?.handler("", commandContext())
    await Promise.resolve()
    const view = host.snapshots()[0]
    assert.ok(view)

    host.clientStatus("target", view.instanceId, "ready")
    host.clientStatus("target", view.instanceId, "disposed")
    assert.deepEqual(host.snapshots(), [view])
    assert.equal(
      statuses.some((status) => status.state === "error"),
      false
    )

    host.clientStatus("target", view.instanceId, "ready")
    await host.action("target", view.instanceId, "__close")
    await pending
    assert.equal(originalCalls, 0)
    assert.deepEqual(host.snapshots(), [])
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open", "close"]
    )
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("RPC custom messages open native cards without waiting for a client mount", async () => {
  const files = await fixture(`
    export default (web) => web.registerRendererAdapter({
      id: "notice.native",
      render: ({ payload }) => ({
        viewId: "notice.card",
        placement: "conversation.after",
        state: payload.message
      })
    })
  `)
  const events: WebUiViewEvent[] = []
  const statuses: WebUiExtensionStatus[] = []
  const target = extension(files.targetPath, () => {})
  target.messageRenderers.set("notice", () => undefined as never)
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          rendererAdapters: [
            {
              kind: "message",
              name: "notice",
              handler: "notice.native",
            },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  const message = {
    role: "custom",
    customType: "notice",
    content: "Native content",
    display: true,
    timestamp: 1,
  }
  try {
    await host.initialize([target])
    host.tryRenderMessage("notice", message, {
      entryId: "entry-1",
      customType: "notice",
      messageTimestamp: 1,
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    const opened = events[0]
    assert.equal(opened?.kind, "open")
    assert.equal(host.snapshots().length, 1)
    assert.deepEqual(
      opened?.kind === "open" ? opened.view.state : undefined,
      message
    )
    assert.deepEqual(
      opened?.kind === "open" ? opened.view.replacesEntry : undefined,
      {
        entryId: "entry-1",
        customType: "notice",
        messageTimestamp: 1,
      }
    )
    if (opened?.kind === "open") {
      host.clientStatus("target", opened.view.instanceId, "disposed")
    }
    assert.equal(host.snapshots().length, 1)
    assert.equal(statuses.at(-1)?.state, "compatible-by-probe")
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("an external adapter wins over a compatible built-in", async () => {
  const files = await fixture(`
    export default (web) => web.registerCommandAdapter({
      id: "target.open",
      probe: () => ({ compatible: true }),
      handle: () => ({ handled: true })
    })
  `)
  const builtinWorker = path.join(files.root, "builtin.mjs")
  await writeFile(
    builtinWorker,
    `export default (web) => web.registerCommandAdapter({
      id: "target.open",
      probe: () => ({ compatible: true }),
      handle: () => ({ handled: false })
    })`
  )
  const statuses: WebUiExtensionStatus[] = []
  let originalCalls = 0
  const target = extension(files.targetPath, () => (originalCalls += 1))
  const external = descriptor(files.workerPath)
  const builtin = descriptor(builtinWorker, {
    key: "builtin:pi-target-webui#target",
    source: "builtin",
  })
  const host = new WebUiAdapterHost({
    descriptors: [builtin, external],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.commands.get("target")?.handler("", commandContext())
    assert.equal(originalCalls, 0)
    assert.equal(statuses.at(-1)?.adapterKey, external.key)
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("equal-priority compatible adapters conflict instead of guessing", async () => {
  const files = await fixture(`
    export default (web) => web.registerCommandAdapter({
      id: "target.open",
      probe: () => ({ compatible: true }),
      handle: () => ({ handled: true })
    })
  `)
  const secondWorker = path.join(files.root, "second.mjs")
  await writeFile(secondWorker, await readFile(files.workerPath))
  const statuses: WebUiExtensionStatus[] = []
  let originalCalls = 0
  const target = extension(files.targetPath, () => (originalCalls += 1))
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath),
      descriptor(secondWorker, {
        key: "external:pi-target-alt-webui#target",
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.commands.get("target")?.handler("", commandContext())
    assert.equal(statuses.at(-1)?.state, "conflict")
    assert.equal(originalCalls, 1)
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("tool execution is attributed to renderer adapters", async () => {
  const files = await fixture(`
    export default (web) => web.registerRendererAdapter({
      id: "renderable.native",
      probe: () => ({ compatible: true }),
      render(request) {
        return {
          viewId: "renderable.view",
          placement: "conversation.after",
          state: request.invocation.operation,
          blocking: false
        }
      }
    })
  `)
  const target = extension(files.targetPath, () => {})
  target.tools.set("renderable", {
    definition: {
      name: "renderable",
      description: "Renderable tool",
      parameters: {},
      execute: async () => ({ content: [{ type: "text", text: "done" }] }),
    },
  } as never)
  const events: WebUiViewEvent[] = []
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          rendererAdapters: [
            {
              kind: "tool",
              name: "renderable",
              handler: "renderable.native",
            },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: () => {},
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    const execute = target.tools.get("renderable")?.definition.execute
    assert.ok(execute)
    await execute(
      "tool-call",
      {},
      new AbortController().signal,
      undefined,
      {} as never
    )
    assert.deepEqual(
      host.snapshots().map((view) => (view.state as { type: string }).type),
      ["tool.renderCall", "tool.renderResult"]
    )
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open", "open"]
    )
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("status renderers keep one persistent view and close it when status clears", async () => {
  const files = await fixture(`
    export default (web) => web.registerRendererAdapter({
      id: "target.status",
      render: ({ payload }) => payload.statusText
        ? { viewId: "target.card", placement: "composer.above", state: payload }
        : undefined
    })
  `)
  const events: WebUiViewEvent[] = []
  const target = extension(files.targetPath, () => {})
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          rendererAdapters: [
            { kind: "status", name: "target", handler: "target.status" },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: () => {},
    emitTargetEvent: () => {},
  })
  const statusInvocation = {
    owner: {
      extensionPath: files.targetPath,
      resolvedPath: files.targetPath,
      sourceInfo: target.sourceInfo,
      packageName: "pi-target",
      packageVersion: "1.1.0",
    },
    operation: { type: "status.render" as const, key: "target" },
  }
  try {
    await host.initialize([target])
    host.tryRender(statusInvocation, { statusText: "active" })
    await Promise.resolve()
    host.tryRender(statusInvocation, { statusText: "paused" })
    host.tryRender(statusInvocation, { statusText: undefined })
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open", "update", "close"]
    )
    assert.equal(host.snapshots().length, 0)
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("tool execution adapters can handle a target tool and emit target events", async () => {
  const files = await fixture(`
    export default (web) => web.registerToolExecutionAdapter({
      id: "interactive.execute",
      probe: () => ({ compatible: true }),
      execute(request, context) {
        context.emitTargetEvent("ask_user_question:requested", {
          toolCallId: request.toolCallId,
          params: request.params
        })
        return {
          handled: true,
          result: {
            content: [{ type: "text", text: "answered in WebUI" }],
            details: { source: "webui" }
          }
        }
      }
    })
  `)
  const target = extension(files.targetPath, () => {})
  let originalCalls = 0
  registerTool(target, "interactive", async () => {
    originalCalls += 1
    return { content: [{ type: "text", text: "original" }] }
  })
  const targetEvents: Array<{ name: string; payload: unknown }> = []
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          toolExecutionAdapters: [
            { tool: "interactive", handler: "interactive.execute" },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: () => {},
    emitTargetEvent: (name, payload) => targetEvents.push({ name, payload }),
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    const execute = target.tools.get("interactive")?.definition.execute
    assert.ok(execute)
    const result = await execute(
      "tool-call-1",
      { question: "Continue?" },
      new AbortController().signal,
      undefined,
      {} as ExtensionContext
    )
    assert.equal(originalCalls, 0)
    assert.deepEqual(result, {
      content: [{ type: "text", text: "answered in WebUI" }],
      details: { source: "webui" },
    })
    assert.deepEqual(targetEvents, [
      {
        name: "ask_user_question:requested",
        payload: {
          toolCallId: "tool-call-1",
          params: { question: "Continue?" },
        },
      },
    ])
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("tool execution adapters can rewrite params before the original tool", async () => {
  const files = await fixture(`
    export default (web) => web.registerToolExecutionAdapter({
      id: "target.execute",
      execute(_request, context) {
        void context.openView({
          viewId: "target.transient",
          placement: "conversation.after",
          state: {}
        })
        return { handled: false, params: { mode: "rewritten" } }
      }
    })
  `)
  const target = extension(files.targetPath, () => {})
  let originalParams: unknown
  const events: WebUiViewEvent[] = []
  registerTool(target, "target_tool", async (_id, params) => {
    originalParams = params
    return { content: [] }
  })
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          toolExecutionAdapters: [
            { tool: "target_tool", handler: "target.execute" },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: () => {},
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.tools
      .get("target_tool")
      ?.definition.execute(
        "tool-call-2",
        { mode: "original" },
        undefined,
        undefined,
        {} as ExtensionContext
      )
    assert.deepEqual(originalParams, { mode: "rewritten" })
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open", "close"]
    )
    assert.deepEqual(host.snapshots(), [])
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("invalid handled tool results fail the adapter and execute the original tool", async () => {
  const files = await fixture(`
    export default (web) => web.registerToolExecutionAdapter({
      id: "target.execute",
      execute: () => ({
        handled: true,
        result: { content: "not-an-array" }
      })
    })
  `)
  const statuses: WebUiExtensionStatus[] = []
  const target = extension(files.targetPath, () => {})
  let originalCalls = 0
  registerTool(target, "target_tool", async () => {
    originalCalls += 1
    return { content: [{ type: "text", text: "original" }] }
  })
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          toolExecutionAdapters: [
            { tool: "target_tool", handler: "target.execute" },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    const result = await target.tools
      .get("target_tool")
      ?.definition.execute(
        "tool-call-3",
        {},
        undefined,
        undefined,
        {} as ExtensionContext
      )
    assert.equal(originalCalls, 1)
    assert.deepEqual(result, {
      content: [{ type: "text", text: "original" }],
    })
    assert.equal(statuses.at(-1)?.state, "error")
    assert.match(statuses.at(-1)?.reason ?? "", /array content result/)
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("tool adapter errors after context side effects do not execute the original tool", async (t) => {
  const scenarios = [
    {
      name: "emitTargetEvent",
      effect: 'context.emitTargetEvent("target:changed", {})',
    },
    {
      name: "openView",
      effect: `await context.openView({
        viewId: "target.transient",
        placement: "conversation.after",
        state: {}
      })`,
    },
    {
      name: "updateView",
      effect: 'context.updateView(instanceId, { phase: "changed" })',
    },
    {
      name: "closeView",
      effect: "context.closeView(instanceId)",
    },
    {
      name: "invokeTargetTool",
      effect: 'await context.invokeTargetTool("side_effect", {})',
    },
  ] as const

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const files = await fixture(`
        let instanceId
        export default (web) => {
          web.registerCommandAdapter({
            id: "target.open",
            async handle(_request, context) {
              instanceId = await context.openView({
                viewId: "target.control",
                placement: "session.rightPanel",
                state: {}
              })
              return { handled: true }
            }
          })
          web.registerToolExecutionAdapter({
            id: "target.execute",
            async execute(_request, context) {
              ${scenario.effect}
              throw new Error("failed after side effect")
            }
          })
        }
      `)
      const target = extension(files.targetPath, () => {})
      let originalCalls = 0
      let invokedTargetTools = 0
      registerTool(target, "interactive", async () => {
        originalCalls += 1
        return { content: [{ type: "text", text: "original" }] }
      })
      registerTool(target, "side_effect", async () => {
        invokedTargetTools += 1
        return { content: [{ type: "text", text: "changed" }] }
      })
      const statuses: WebUiExtensionStatus[] = []
      const host = new WebUiAdapterHost({
        descriptors: [
          descriptor(files.workerPath, {
            contributes: {
              commandAdapters: [{ command: "target", handler: "target.open" }],
              toolExecutionAdapters: [
                { tool: "interactive", handler: "target.execute" },
              ],
            },
          }),
        ],
        session: () => ({
          cwd: "/tmp/project",
          listSessions: async () => [],
          switchSession: async () => ({ cancelled: false }),
        }),
        emitView: () => {},
        emitStatus: (status) => statuses.push(status),
        emitTargetEvent: () => {},
      })
      try {
        createExtensionInstrumentor(() => host)({
          extensions: [target],
        } as LoadExtensionsResult)
        await host.initialize([target])
        await target.commands.get("target")?.handler("", commandContext())
        const view = host.snapshots()[0]
        assert.ok(view)
        host.clientStatus("target", view.instanceId, "ready")

        const result = await target.tools
          .get("interactive")
          ?.definition.execute(
            "tool-call-side-effect",
            {},
            undefined,
            undefined,
            {} as ExtensionContext
          )

        assert.equal(originalCalls, 0)
        assert.equal(
          invokedTargetTools,
          scenario.name === "invokeTargetTool" ? 1 : 0
        )
        assert.deepEqual(result, {
          content: [
            {
              type: "text",
              text: "WebUI adapter failed after producing side effects: failed after side effect",
            },
          ],
          isError: true,
        })
        assert.equal(statuses.at(-1)?.state, "error")
      } finally {
        host.dispose()
        await rm(files.root, { recursive: true, force: true })
      }
    })
  }
})

test("view actions retain the opening target context for restricted tool invocation", async () => {
  const files = await fixture(`
    export default (web) => {
      web.registerCommandAdapter({
        id: "target.open",
        handle(_request, context) {
          void context.openView({
            viewId: "target.control",
            placement: "session.rightPanel",
            state: {}
          })
          return { handled: true }
        }
      })
      web.registerAction({
        id: "target.invoke",
        async handle({ input }, context) {
          context.emitTargetEvent("target:invoked", input)
          return context.invokeTargetTool(input.name, input.params)
        }
      })
      web.registerToolExecutionAdapter({
        id: "target.execute",
        execute: () => ({
          handled: true,
          result: { content: [{ type: "text", text: "adapted" }] }
        })
      })
    }
  `)
  const target = extension(files.targetPath, () => {})
  let receivedContext: ExtensionContext | undefined
  let receivedParams: unknown
  registerTool(
    target,
    "target_tool",
    async (_id, params, _signal, _update, ctx) => {
      receivedParams = params
      receivedContext = ctx
      return { content: [{ type: "text", text: "done" }] }
    }
  )
  const targetEvents: Array<{ name: string; payload: unknown }> = []
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          commandAdapters: [{ command: "target", handler: "target.open" }],
          toolExecutionAdapters: [
            { tool: "target_tool", handler: "target.execute" },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: () => {},
    emitStatus: () => {},
    emitTargetEvent: (name, payload) => targetEvents.push({ name, payload }),
  })
  const openingContext = commandContext()
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.commands.get("target")?.handler("", openingContext)
    const view = host.snapshots()[0]
    assert.ok(view)
    host.clientStatus("target", view.instanceId, "ready")
    const result = await host.action(
      "target",
      view.instanceId,
      "target.invoke",
      { name: "target_tool", params: { answer: 42 } }
    )
    assert.deepEqual(result, {
      content: [{ type: "text", text: "done" }],
    })
    assert.equal(receivedContext, openingContext)
    assert.deepEqual(receivedParams, { answer: 42 })
    assert.deepEqual(targetEvents, [
      {
        name: "target:invoked",
        payload: { name: "target_tool", params: { answer: 42 } },
      },
    ])
    await assert.rejects(
      host.action("target", view.instanceId, "target.invoke", {
        name: "foreign_tool",
        params: {},
      }),
      /Target extension does not register tool foreign_tool/
    )
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("a stale action cannot update or close a reopened view", async () => {
  const files = await fixture(`
    export default (web) => {
      web.registerCommandAdapter({
        id: "target.open",
        handle(_request, context) {
          void context.openView({
            viewId: "target.control",
            placement: "session.rightPanel",
            state: { phase: "ready" }
          })
          return { handled: true }
        }
      })
      web.registerAction({
        id: "target.slow",
        async handle({ instanceId }, context) {
          await context.invokeTargetTool("wait", {})
          context.updateView(instanceId, { phase: "late" })
          context.closeView(instanceId)
          return "finished"
        }
      })
    }
  `)
  const started = deferred()
  const release = deferred()
  const target = extension(files.targetPath, () => {})
  registerTool(target, "wait", async () => {
    started.resolve()
    await release.promise
    return { content: [] }
  })
  const events: WebUiViewEvent[] = []
  const statuses: WebUiExtensionStatus[] = []
  const host = new WebUiAdapterHost({
    descriptors: [descriptor(files.workerPath)],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: (status) => statuses.push(status),
    emitTargetEvent: () => {},
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.commands.get("target")?.handler("", commandContext())
    const originalView = host.snapshots()[0]
    assert.ok(originalView)
    host.clientStatus("target", originalView.instanceId, "ready")

    const pending = host.action(
      "target",
      originalView.instanceId,
      "target.slow"
    )
    await started.promise
    await host.action("target", originalView.instanceId, "__close")
    await target.commands.get("target")?.handler("", commandContext())
    const reopenedView = host.snapshots()[0]
    assert.ok(reopenedView)
    assert.notEqual(reopenedView.instanceId, originalView.instanceId)
    host.clientStatus("target", reopenedView.instanceId, "ready")

    release.resolve()
    assert.equal(await pending, "finished")
    assert.deepEqual(host.snapshots(), [reopenedView])
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open", "close", "open"]
    )
    assert.equal(
      statuses.some((status) => status.state === "error"),
      false
    )
  } finally {
    release.resolve()
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})

test("non-status renderers update a stable upsertKey in place", async () => {
  const files = await fixture(`
    export default (web) => web.registerRendererAdapter({
      id: "renderable.native",
      render: ({ payload }) => ({
        viewId: "renderable.view",
        placement: "conversation.after",
        upsertKey: payload.toolCallId,
        state: payload
      })
    })
  `)
  const target = extension(files.targetPath, () => {})
  registerTool(target, "renderable", async () => ({ content: [] }))
  const events: WebUiViewEvent[] = []
  const host = new WebUiAdapterHost({
    descriptors: [
      descriptor(files.workerPath, {
        contributes: {
          rendererAdapters: [
            {
              kind: "tool",
              name: "renderable",
              handler: "renderable.native",
            },
          ],
        },
      }),
    ],
    session: () => ({
      cwd: "/tmp/project",
      listSessions: async () => [],
      switchSession: async () => ({ cancelled: false }),
    }),
    emitView: (event) => events.push(event),
    emitStatus: () => {},
    emitTargetEvent: () => {},
  })
  const renderInvocation = {
    owner: {
      extensionPath: files.targetPath,
      resolvedPath: files.targetPath,
      sourceInfo: target.sourceInfo,
      packageName: "pi-target",
      packageVersion: "1.1.0",
    },
    operation: { type: "tool.renderCall" as const, name: "renderable" },
  }
  try {
    await host.initialize([target])
    host.tryRender(renderInvocation, { toolCallId: "stable", phase: "start" })
    host.tryRender(renderInvocation, { toolCallId: "stable", phase: "finish" })
    assert.deepEqual(
      events.map((event) => event.kind),
      ["open", "update"]
    )
    assert.equal(host.snapshots().length, 1)
    assert.deepEqual(host.snapshots()[0]?.state, {
      toolCallId: "stable",
      phase: "finish",
    })
    assert.equal(host.snapshots()[0]?.revision, 1)
  } finally {
    host.dispose()
    await rm(files.root, { recursive: true, force: true })
  }
})
