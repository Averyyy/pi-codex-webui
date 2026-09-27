import assert from "node:assert/strict"
import test from "node:test"
import { SessionViewController } from "./session-view-controller"
import { suspendIdleSessionEventStreams } from "./session-view-controller"
import { RuntimeLiveState } from "./runtime-live"
import { DIAGNOSTIC_EVENT_TYPES } from "./runtime-diagnostics"
import { ProjectGitStatusStore } from "./project-git-status-store"
import type { SessionView } from "./session-view-types"

const epoch = "11111111-1111-4111-8111-111111111111"
const cursor = (n: number) => "event-" + epoch + "-" + n
class Source {
  listeners = new Map<string, Set<EventListener>>()
  closed = false
  addEventListener(type: string, callback: EventListener) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(callback)
    this.listeners.set(type, set)
  }
  removeEventListener(type: string, callback: EventListener) {
    this.listeners.get(type)?.delete(callback)
  }
  close() {
    this.closed = true
  }
  emit(sequence: number, type: string, payload: unknown = {}) {
    const event = new MessageEvent(type, {
      lastEventId: cursor(sequence),
      data: JSON.stringify({ id: cursor(sequence), type, payload }),
    })
    for (const callback of this.listeners.get(type) ?? []) callback(event)
  }
}
function view(
  id: string,
  sequence = 0,
  status: SessionView["runtime"]["status"] = "busy"
): SessionView {
  return {
    eventCursor: cursor(sequence),
    runtime: { status, snapshot: null },
    live: {
      messages: [],
      tools: [],
      activeMessageIds: [],
      nextMessageId: 0,
      runtimeStatus: status,
    },
    snapshot: {
      session: {
        id,
        projectId: null,
        cwd: "/",
        nativeSessionId: id,
        nativeSessionFile: "/" + id + ".jsonl",
        title: id,
        firstMessage: "",
        createdAt: "2026-09-12T00:00:00.000Z",
        updatedAt: "2026-09-12T00:00:00.000Z",
        messageCount: 0,
        archivedAt: null,
        isPinned: false,
        hasUnreadCompletion: false,
        runtimeKind: "pi",
        runtimeProfileId: "pi",
        migratedFromSessionId: null,
        projectPath: null,
        projectName: null,
        parentSessionFile: null,
      },
      entries: [],
      goalState: null,
      history: {
        leafId: null,
        nextCursor: null,
        boundary: "page",
        entryIds: [],
        sourceHash: "empty",
        anchorCursor: "anchor",
        generation: 0,
        atLatest: true,
      },
    },
  }
}
const message = (text: string) => ({
  message: {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: 1,
  },
})
const scheduler = {
  request: () => 1,
  cancel: () => {},
}

test("switching away keeps streaming without a raw event backlog or cross-session state", () => {
  const sources: Source[] = []
  let requests = 0
  const create = () => {
    const source = new Source()
    sources.push(source)
    return source
  }
  const request = (async () => {
    requests++
    throw new Error("Unexpected request")
  }) as typeof fetch
  const initial = view("A")
  const a = new SessionViewController("A", initial, request, create, scheduler)
  const b = new SessionViewController(
    "B",
    view("B"),
    request,
    create,
    scheduler
  )
  a.retain()
  b.retain()
  sources[0]!.emit(1, "session.message.start", message("begin"))
  a.release()
  assert.equal(sources[0]!.closed, false)
  for (let i = 0; i < 6000; i++)
    sources[0]!.emit(i + 2, "session.message.update", message("token " + i))
  a.retain(initial)
  a.store.flush()
  assert.equal(a.store.getMessages().length, 1)
  assert.deepEqual(a.store.getMessages()[0]!.parts, [
    { type: "text", text: "token 5999" },
  ])
  assert.equal(b.store.getMessages().length, 0)
  assert.equal(requests, 0)
  a.dispose()
  b.dispose()
})

test("completion while away replaces live messages with durable history and resumes at the committed cursor", async () => {
  const sources: Source[] = []
  const urls: string[] = []
  const timers: Array<() => void> = []
  let timerId = 0
  const create = (url: string) => {
    urls.push(url)
    const source = new Source()
    sources.push(source)
    return source
  }
  const next = view("A", 4)
  next.runtime.status = "ready"
  next.live.runtimeStatus = "ready"
  next.live.nextMessageId = 1
  next.snapshot.entries = [
    {
      kind: "message",
      id: "durable",
      timestamp: "2026-09-12T00:00:00.000Z",
      role: "assistant",
      parts: [{ type: "text", text: "done" }],
    },
  ]
  next.snapshot.history = {
    ...next.snapshot.history!,
    leafId: "durable",
    entryIds: ["durable"],
    sourceHash: "done",
    extendsLeaf: true,
  }
  const request = (async () =>
    new Response(JSON.stringify(next))) as typeof fetch
  const a = new SessionViewController(
    "A",
    view("A"),
    request,
    create,
    scheduler,
    {
      idleGraceMs: 100,
      setTimer(callback) {
        timers.push(callback)
        return ++timerId as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer() {},
    }
  )
  a.retain()
  sources[0]!.emit(1, "session.message.start", message("begin"))
  a.release()
  sources[0]!.emit(2, "session.message.end", message("done"))
  sources[0]!.emit(3, "session.completed")
  await a.refresh()
  assert.equal(a.store.getMessages().length, 0)
  assert.equal(a.store.getTranscript()!.entries.length, 1)
  assert.equal(a.store.getTranscript()!.entries[0]!.id, "durable")
  assert.equal(sources[0]!.closed, false)
  assert.equal(sources.length, 1)
  timers[0]!()
  assert.equal(sources[0]!.closed, true)
  a.retain(next)
  assert.ok(urls.at(-1)?.includes(encodeURIComponent(cursor(3))))
  sources.at(-1)!.emit(5, "runtime.busy")
  sources.at(-1)!.emit(6, "session.message.start", message("next"))
  a.store.flush()
  assert.equal(a.store.getMessages()[0]!.id, 2)
  a.dispose()
  assert.equal(sources[0]!.closed, true)
})

test("cold controllers share one initial view request through StrictMode retain", async () => {
  const urls: string[] = []
  const sources: Source[] = []
  const initial = view("cold", 7)
  const controller = new SessionViewController(
    "cold",
    null,
    (async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify(initial))
    }) as typeof fetch,
    () => {
      const source = new Source()
      sources.push(source)
      return source
    },
    scheduler
  )

  controller.retain()
  controller.release()
  controller.retain()
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.equal(urls.length, 0)
  sources[0]!.emit(7, "stream.checkpoint", { cursor: cursor(7) })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(urls.length, 1)
  assert.ok(urls[0]?.includes("previousLeaf="))
  assert.ok(sources[0])
  assert.equal(controller.initialView?.eventCursor, cursor(7))
  controller.dispose()
})

test("cold view errors remain visible and a retry loads the transcript", async () => {
  let requests = 0
  const sources: Source[] = []
  const initial = view("cold-retry", 1)
  const controller = new SessionViewController(
    "cold-retry",
    null,
    (async () => {
      requests++
      return requests === 1
        ? new Response(JSON.stringify({ error: "temporary failure" }), {
            status: 503,
          })
        : new Response(JSON.stringify(initial))
    }) as typeof fetch,
    () => {
      const source = new Source()
      sources.push(source)
      return source
    },
    scheduler
  )

  controller.retain()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(requests, 0)
  sources[0]!.emit(1, "stream.checkpoint", { cursor: cursor(1) })
  await new Promise<void>((resolve) => setImmediate(resolve))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(controller.getView(), null)
  assert.ok(controller.getMetadata().error)

  await controller.refresh()
  assert.equal(requests, 2)
  assert.equal(controller.getView()?.snapshot.session.id, "cold-retry")
  assert.equal(controller.getMetadata().error, null)
  controller.dispose()
})

test("a selected native file revision forces one authoritative view sync", async () => {
  const urls: string[] = []
  const sources: Source[] = []
  const latest = view("external", 3)
  latest.snapshot.session.title = "external append"
  const controller = new SessionViewController(
    "external",
    view("external", 1),
    (async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify(latest))
    }) as typeof fetch,
    () => {
      const source = new Source()
      sources.push(source)
      return source
    },
    scheduler
  )

  controller.retain()
  await controller.refreshSelectedFile("stat-revision-2")
  await controller.refreshSelectedFile("stat-revision-2")
  assert.equal(urls.length, 1)
  assert.ok(urls[0]?.includes("syncSelectedFile=1"))
  assert.equal(controller.getView()?.snapshot.session.title, "external append")
  controller.dispose()
})

test("SSE grace is reused and stale timers cannot close a newer busy session", () => {
  const callbacks: Array<() => void> = []
  let timerId = 0
  const source = new Source()
  const idle = view("idle", 0, "busy")
  const controller = new SessionViewController(
    "idle",
    idle,
    (async () => new Response(JSON.stringify(idle))) as typeof fetch,
    () => source,
    scheduler,
    {
      idleGraceMs: 100,
      setTimer(callback) {
        callbacks.push(callback)
        return ++timerId as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer() {},
    }
  )

  controller.retain()
  controller.release()
  controller.retain()
  controller.release()
  callbacks[0]!()

  assert.equal(source.closed, false)
  callbacks[1]!()
  assert.equal(source.closed, true)
  controller.dispose()
})

test("unretained busy sessions stay within the shared connection budget", () => {
  const sources: Source[] = []
  const controllers = Array.from({ length: 4 }, (_, index) => {
    const initial = view(`idle-${index}`, 0, "busy")
    return new SessionViewController(
      initial.snapshot.session.id,
      initial,
      (async () => new Response(JSON.stringify(initial))) as typeof fetch,
      () => {
        const source = new Source()
        sources.push(source)
        return source
      },
      scheduler,
      {
        idleGraceMs: 1_000,
        setTimer(callback) {
          return setTimeout(callback, 1_000)
        },
        clearTimer(handle) {
          clearTimeout(handle)
        },
      }
    )
  })

  for (const controller of controllers) controller.retain()
  for (const controller of controllers) controller.release()

  assert.equal(sources.filter((source) => !source.closed).length, 1)
  assert.equal(sources[0]!.closed, true)
  assert.equal(sources[1]!.closed, true)
  assert.equal(sources[2]!.closed, true)
  assert.equal(sources[3]!.closed, false)
  assert.equal(
    controllers.every((controller) => controller.active()),
    true
  )
  controllers.forEach((controller) => controller.dispose())
})

test("terminal suspends only idle session transport and diagnostics shares visible stream", () => {
  const sources: Source[] = []
  const gitSources: Source[] = []
  const urls: string[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ branch: null, changes: [] }))) as typeof fetch
  const create = (url: string) => {
    urls.push(url)
    const source = new Source()
    sources.push(source)
    return source
  }
  const visibleView = view("visible", 0, "ready")
  const backgroundView = view("background", 0, "busy")
  const visible = new SessionViewController(
    "visible",
    visibleView,
    (async () => new Response(JSON.stringify(visibleView))) as typeof fetch,
    create,
    scheduler
  )
  const background = new SessionViewController(
    "background",
    backgroundView,
    (async () => new Response(JSON.stringify(backgroundView))) as typeof fetch,
    create,
    scheduler
  )
  const global = new Source()
  const terminal = new Source()
  terminal.close()
  const projectGit = new ProjectGitStatusStore("project-a", null, () => {
    const source = new Source()
    gitSources.push(source)
    return source as unknown as EventSource
  })

  projectGit.retain()
  visible.retain()
  background.retain()
  background.release()
  assert.equal(
    [...sources, ...gitSources, global, terminal].filter(
      (source) => !source.closed
    ).length,
    4
  )

  let diagnosticEvents = 0
  const unsubscribeDiagnostics = visible.events.subscribe(
    DIAGNOSTIC_EVENT_TYPES,
    () => diagnosticEvents++
  )
  const resumeBackgroundTransports = suspendIdleSessionEventStreams()
  assert.equal(sources[1]!.closed, true)
  assert.equal(sources[0]!.closed, false)
  assert.equal(background.active(), true)
  terminal.closed = false
  assert.equal(
    [...sources, ...gitSources, global, terminal].filter(
      (source) => !source.closed
    ).length,
    4
  )

  sources[0]!.emit(1, "runtime.busy")
  assert.equal(diagnosticEvents, 1)
  assert.equal(sources.length, 2, "diagnostics must not create another stream")

  terminal.close()
  resumeBackgroundTransports()
  background.retain()
  assert.equal(
    [...sources, ...gitSources, global, terminal].filter(
      (source) => !source.closed
    ).length,
    4
  )
  assert.equal(background.active(), true)
  assert.ok(urls.at(-1)?.includes(`after=${encodeURIComponent(cursor(0))}`))
  sources.at(-1)!.emit(2, "runtime.idle")
  assert.equal(background.store.getRuntimeStatus(), "ready")
  assert.equal(background.active(), false)

  unsubscribeDiagnostics()
  visible.dispose()
  background.dispose()
  projectGit.dispose()
  global.close()
  terminal.close()
  globalThis.fetch = originalFetch
})

test("events arriving during transcript reconciliation are replayed after the captured view", async () => {
  let resolve!: (response: Response) => void
  const request = (async () =>
    new Promise<Response>((done) => {
      resolve = done
    })) as typeof fetch
  const source = new Source()
  const a = new SessionViewController(
    "A",
    view("A"),
    request,
    () => source,
    scheduler
  )
  a.retain()
  source.emit(1, "session.message.start", message("first"))
  source.emit(2, "session.message.end", message("first"))
  const refreshing = a.refresh()
  await new Promise<void>((resolve) => setImmediate(resolve))
  const captured = view("A", 3)
  captured.live.nextMessageId = 1
  captured.live.runtimeStatus = "ready"
  captured.runtime.status = "ready"
  source.emit(4, "runtime.busy")
  source.emit(5, "session.message.start", message("second"))
  source.emit(6, "session.message.update", message("second continued"))
  resolve(new Response(JSON.stringify(captured)))
  await refreshing
  assert.equal(a.store.getRuntimeStatus(), "busy")
  assert.equal(a.store.getMessages().length, 1)
  assert.deepEqual(a.store.getMessages()[0]!.parts, [
    { type: "text", text: "second continued" },
  ])
  a.dispose()
})

test("completion and covered entry events reconcile through one view request", async () => {
  let resolveView!: (response: Response) => void
  let requests = 0
  const source = new Source()
  const controller = new SessionViewController(
    "A",
    view("A"),
    (async () => {
      requests++
      return new Promise<Response>((resolve) => {
        resolveView = resolve
      })
    }) as typeof fetch,
    () => source,
    scheduler
  )

  controller.retain()
  source.emit(1, "session.completed")
  await new Promise<void>((resolve) => setImmediate(resolve))
  source.emit(2, "session.entry.appended")
  const captured = view("A", 2, "ready")
  resolveView(new Response(JSON.stringify(captured)))
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.equal(requests, 1)
  assert.equal(controller.initialView?.eventCursor, cursor(2))
  controller.dispose()
})

test("session metadata patches only override a view request that was already in flight", async () => {
  let resolveFirst!: (response: Response) => void
  let requests = 0
  const source = new Source()
  const firstResponse = view("A", 1)
  firstResponse.snapshot.session.title = "indexed title"
  const request = (async () => {
    requests++
    if (requests === 1)
      return new Promise<Response>((resolve) => {
        resolveFirst = resolve
      })
    const latest = view("A", 2)
    latest.snapshot.session.title = "native title"
    return new Response(JSON.stringify(latest))
  }) as typeof fetch
  const controller = new SessionViewController(
    "A",
    view("A", 0),
    request,
    () => source,
    scheduler
  )

  controller.retain()
  const refreshing = controller.refresh()
  await new Promise<void>((resolve) => setImmediate(resolve))
  controller.updateSessionSummary({ title: "renamed" })
  resolveFirst(new Response(JSON.stringify(firstResponse)))
  await refreshing
  assert.equal(controller.initialView?.snapshot.session.title, "renamed")

  await controller.refresh()
  assert.equal(controller.initialView?.snapshot.session.title, "native title")
  controller.dispose()
})

test("HTTP view cursor cannot skip delivered TUI or prompt events on reconnect", async () => {
  let resolveView!: (response: Response) => void
  const urls: string[] = []
  const sources: Source[] = []
  const timers: Array<() => void> = []
  let timerId = 0
  const nextView = view("A", 3, "ready")
  const controller = new SessionViewController(
    "A",
    view("A", 1, "ready"),
    (async (input) => {
      urls.push(String(input))
      return new Promise<Response>((resolve) => {
        resolveView = resolve
      })
    }) as typeof fetch,
    (url) => {
      urls.push(url)
      const source = new Source()
      sources.push(source)
      return source
    },
    scheduler,
    {
      idleGraceMs: 50,
      setTimer(callback) {
        timers.push(callback)
        return ++timerId as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer() {},
    }
  )

  controller.retain()
  sources[0]!.emit(1, "stream.checkpoint", { cursor: cursor(1) })
  const refreshing = controller.refresh()
  await new Promise<void>((resolve) => setImmediate(resolve))
  resolveView(new Response(JSON.stringify(nextView)))
  await refreshing

  const surfaceId = "66666666-6666-4666-8666-666666666666"
  sources[0]!.emit(2, "tui.surface", {
    version: 1,
    kind: "open",
    surface: {
      version: 1,
      surfaceId,
      mode: "inline",
      progress: false,
      columns: 80,
      rows: 24,
      revision: 0,
      data: "delayed prompt",
    },
  })
  sources[0]!.emit(2, "extension.ui.request", {
    requestId: "delayed-request",
    method: "input",
    title: "Delayed input",
    expiresAt: null,
  })
  assert.equal(
    controller.runtime.getSnapshot().tuiSurfaces[surfaceId]?.data,
    "delayed prompt"
  )
  assert.equal(
    controller.runtime.getSnapshot().extensionRequests[0]?.requestId,
    "delayed-request"
  )

  controller.release()
  timers[0]!()
  controller.retain()
  assert.ok(urls.at(-1)?.includes(`after=${encodeURIComponent(cursor(2))}`))
  sources[1]!.emit(3, "extension.ui.request", {
    requestId: "replayed-request",
    method: "input",
    title: "Replayed input",
    expiresAt: null,
  })
  assert.equal(
    controller.runtime
      .getSnapshot()
      .extensionRequests.some(
        (request) => request.requestId === "replayed-request"
      ),
    true
  )
  controller.dispose()
})

test("a view skipped by the runtime generation cannot fence a later delayed queue event", async () => {
  let resolveView!: (response: Response) => void
  const source = new Source()
  const controller = new SessionViewController(
    "A",
    view("A", 0, "ready"),
    (async () =>
      new Promise<Response>((resolve) => {
        resolveView = resolve
      })) as typeof fetch,
    () => source,
    scheduler
  )
  const queuedItem = (id: string, text: string) => ({
    id,
    text,
    mode: "followUp",
    kind: "message",
  })

  controller.retain()
  const refreshing = controller.refresh()
  await new Promise<void>((resolve) => setImmediate(resolve))
  source.emit(1, "queue.updated", {
    steering: [],
    followUp: [],
    items: [queuedItem("11111111-1111-4111-8111-111111111111", "first")],
  })
  const responseView = view("A", 3, "ready")
  resolveView(new Response(JSON.stringify(responseView)))
  await refreshing

  source.emit(2, "queue.updated", {
    steering: [],
    followUp: [],
    items: [queuedItem("22222222-2222-4222-8222-222222222222", "delayed C2")],
  })
  assert.equal(
    controller.runtime.getSnapshot().queuedMessages[0]?.text,
    "delayed C2"
  )
  controller.dispose()
})

test("successful compaction end triggers controller-owned view reconciliation", async () => {
  let requests = 0
  const source = new Source()
  const captured = view("A", 1, "ready")
  const controller = new SessionViewController(
    "A",
    view("A"),
    (async () => {
      requests++
      return new Response(JSON.stringify(captured))
    }) as typeof fetch,
    () => source,
    scheduler
  )

  controller.retain()
  source.emit(1, "compaction.end", { aborted: false, result: {} })
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.equal(requests, 1)
  assert.equal(controller.initialView?.eventCursor, cursor(1))
  controller.dispose()
})

test("a settled checkpoint cannot erase a newer live run", () => {
  const live = new RuntimeLiveState("old")
  live.apply({ type: "runtime.busy", payload: {} })
  live.apply({ type: "session.message.start", payload: message("one") })
  live.apply({ type: "session.message.end", payload: message("one") })
  const revision = live.revision
  live.apply({ type: "runtime.busy", payload: {} })
  live.apply({ type: "session.message.start", payload: message("two") })
  assert.equal(live.checkpoint(revision, "one-durable"), false)
  assert.equal(live.baseLeafId, "old")
  assert.equal(live.capture("busy").state.messages.length, 2)
  live.apply({ type: "session.message.end", payload: message("two") })
  assert.equal(live.checkpoint(live.revision, "two-durable"), true)
  assert.equal(live.baseLeafId, "two-durable")
  assert.equal(live.capture("ready").state.messages.length, 0)
})
