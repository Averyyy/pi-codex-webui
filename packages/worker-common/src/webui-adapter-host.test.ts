import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import type {
  Extension,
  ExtensionCommandContext,
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

test("client activation timeout closes the native view before TUI fallback", async () => {
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
    activationTimeoutMs: 10,
  })
  try {
    createExtensionInstrumentor(() => host)({
      extensions: [target],
    } as LoadExtensionsResult)
    await host.initialize([target])
    await target.commands.get("target")?.handler("", commandContext())
    assert.equal(originalCalls, 1)
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
