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
    selectedFileSync: "complete",
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

test("evicting a hidden viewport does not restore transport after a pending view read", async () => {
  let finishRequest!: (response: Response) => void
  const request = (async () =>
    new Promise<Response>((resolve) => {
      finishRequest = resolve
    })) as typeof fetch
  const source = new Source()
  let timers = 0
  let latestTimer: () => void = () => {
    throw new Error("No idle timer was scheduled.")
  }
  const controller = new SessionViewController(
    "evicted",
    view("evicted"),
    request,
    () => source,
    scheduler,
    {
      setTimer: (callback) => {
        timers += 1
        latestTimer = callback
        return timers as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer: () => {},
    }
  )
  controller.retain()
  const pending = controller.refresh()
  controller.release()
  assert.equal(timers, 1)
  controller.dispose()
  finishRequest(Response.json(view("evicted", 1, "ready")))
  await pending
  latestTimer()
  assert.equal(source.closed, true)
  assert.equal(timers, 1)
  assert.throws(() => controller.retain(), /disposed session view/)
})

test("only a typed view 404 marks the cached session unavailable", async () => {
  const unavailable: string[] = []
  const request = (async (url: string) => {
    if (url.includes("/view?")) {
      return Response.json(
        { error: "Session not found.", code: "SessionNotFound" },
        { status: 404 }
      )
    }
    return Response.json(
      { error: "History entry not found.", code: "SessionNotFound" },
      { status: 404 }
    )
  }) as typeof fetch
  const controller = new SessionViewController(
    "deleted",
    view("deleted"),
    request,
    undefined,
    scheduler,
    { onViewUnavailable: (message) => unavailable.push(message) }
  )
  await controller.loadEntry("missing-history-entry")
  assert.deepEqual(unavailable, [])
  await assert.rejects(controller.refresh(), /Session not found/)
  assert.deepEqual(unavailable, ["Session not found."])
  await assert.rejects(controller.refresh(), /Session not found/)
  assert.deepEqual(unavailable, ["Session not found."])
  controller.dispose()
})

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

test("an active selected-file revision remains pending until an idle view sync", async () => {
  const urls: string[] = []
  const deferred = view("active", 1, "busy")
  deferred.selectedFileSync = "deferred"
  const completed = view("active", 2, "ready")
  const controller = new SessionViewController(
    "active",
    view("active", 0),
    (async (input) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify(urls.length === 1 ? deferred : completed)
      )
    }) as typeof fetch,
    () => new Source(),
    scheduler
  )

  await controller.refreshSelectedFile("active-file-revision")
  assert.equal(controller.getView()?.selectedFileSync, "deferred")
  await controller.refresh()
  assert.equal(controller.getView()?.selectedFileSync, "complete")
  await controller.refreshSelectedFile("active-file-revision")
  assert.equal(urls.length, 2)
  assert.ok(urls.every((url) => url.includes("syncSelectedFile=1")))
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

test("a delayed focus response cannot undo show latest or a newer focus", async () => {
  const focused = (id: string) => {
    const snapshot = structuredClone(view("A").snapshot)
    snapshot.entries = [
      {
        kind: "message",
        id,
        timestamp: "2026-09-12T00:00:00.000Z",
        role: "assistant",
        parts: [{ type: "text", text: id }],
      },
    ]
    snapshot.history = {
      ...snapshot.history!,
      leafId: id,
      entryIds: [id],
      sourceHash: id,
      atLatest: false,
    }
    return snapshot
  }
  const latest = view("A", 1, "ready")
  latest.snapshot = focused("latest")
  latest.snapshot.history!.atLatest = true

  const pending = new Map<string, (response: Response) => void>()
  const controller = new SessionViewController(
    "A",
    view("A"),
    (async (input) => {
      const url = new URL(String(input), "http://localhost")
      if (url.pathname.endsWith("/view"))
        return new Response(JSON.stringify(latest))
      const focusId = url.searchParams.get("focusId")
      assert.ok(focusId)
      return new Promise<Response>((resolve) => pending.set(focusId, resolve))
    }) as typeof fetch,
    () => new Source(),
    scheduler
  )

  const oldFocus = controller.revealEntry("old")
  assert.ok(pending.has("old"))
  await controller.showLatest()
  pending.get("old")!(new Response(JSON.stringify(focused("old"))))
  await oldFocus
  assert.equal(controller.store.getTranscript()?.history?.leafId, "latest")
  assert.equal(controller.store.getTranscript()?.history?.atLatest, true)

  const firstFocus = controller.revealEntry("first")
  const secondFocus = controller.revealEntry("second")
  pending.get("second")!(new Response(JSON.stringify(focused("second"))))
  await secondFocus
  pending.get("first")!(new Response(JSON.stringify(focused("first"))))
  await firstFocus
  assert.equal(controller.store.getTranscript()?.history?.leafId, "second")
  controller.dispose()
})

test("an in-flight background refresh preserves a newer focused history page", async () => {
  const initial = view("A")
  initial.snapshot.history = {
    ...initial.snapshot.history!,
    leafId: "latest",
    entryIds: ["latest"],
    sourceHash: "same-file",
  }
  const refreshed = structuredClone(initial)
  refreshed.snapshot.history!.extendsLeaf = true
  const focused = structuredClone(initial.snapshot)
  focused.entries = [
    {
      kind: "message",
      id: "old",
      timestamp: "2026-09-12T00:00:00.000Z",
      role: "user",
      parts: [{ type: "text", text: "old" }],
    },
  ]
  focused.history = {
    ...focused.history!,
    entryIds: ["old"],
    atLatest: false,
  }
  let resolveView!: (response: Response) => void
  const controller = new SessionViewController(
    "A",
    initial,
    (async (input) =>
      String(input).includes("/view?")
        ? new Promise<Response>((resolve) => {
            resolveView = resolve
          })
        : new Response(JSON.stringify(focused))) as typeof fetch,
    () => new Source(),
    scheduler
  )

  const background = controller.refresh()
  await controller.revealEntry("old")
  assert.equal(controller.store.getTranscript()?.history?.atLatest, false)
  resolveView(new Response(JSON.stringify(refreshed)))
  await background
  assert.equal(controller.store.getTranscript()?.history?.atLatest, false)
  assert.deepEqual(
    controller.store.getTranscript()?.entries.map((entry) => entry.id),
    ["old"]
  )
  controller.dispose()
})

test("stale focus failures and earlier pages cannot disturb newer navigation", async () => {
  const initial = view("A")
  initial.snapshot.history!.leafId = "latest"
  initial.snapshot.history!.nextCursor = "older-page"
  let rejectOldFocus!: (error: Error) => void
  let resolveEarlier!: (response: Response) => void
  const focused = structuredClone(initial.snapshot)
  focused.history!.atLatest = false
  focused.entries = [
    {
      kind: "message",
      id: "new-focus",
      timestamp: "2026-09-12T00:00:00.000Z",
      role: "user",
      parts: [{ type: "text", text: "focused" }],
    },
  ]
  const controller = new SessionViewController(
    "A",
    initial,
    (async (input) => {
      const url = new URL(String(input), "http://localhost")
      if (url.searchParams.get("focusId") === "old-focus")
        return new Promise<Response>((_, reject) => {
          rejectOldFocus = reject
        })
      if (url.searchParams.get("focusId") === "new-focus")
        return new Response(JSON.stringify(focused))
      return new Promise<Response>((resolve) => {
        resolveEarlier = resolve
      })
    }) as typeof fetch,
    () => new Source(),
    scheduler
  )

  const earlier = controller.loadEarlier()
  const oldFocus = controller.revealEntry("old-focus")
  await controller.revealEntry("new-focus")
  rejectOldFocus(new Error("stale focus failure"))
  await oldFocus
  resolveEarlier(new Response(JSON.stringify(initial.snapshot)))
  await earlier
  assert.equal(controller.getMetadata().error, null)
  assert.equal(controller.store.getTranscript()?.history?.atLatest, false)
  assert.deepEqual(
    controller.store.getTranscript()?.entries.map((entry) => entry.id),
    ["new-focus"]
  )
  controller.dispose()
})

test("an ordinary append does not cancel an earlier requested focus", async () => {
  const initial = view("A")
  initial.snapshot.history = {
    ...initial.snapshot.history!,
    leafId: "before",
    entryIds: ["before"],
    sourceHash: "before-hash",
  }
  const appended = structuredClone(initial)
  appended.snapshot.history = {
    ...appended.snapshot.history!,
    leafId: "after",
    entryIds: ["before", "after"],
    sourceHash: "after-hash",
    extendsLeaf: true,
  }
  const focused = structuredClone(initial.snapshot)
  focused.history!.atLatest = false
  focused.entries = [
    {
      kind: "message",
      id: "requested-focus",
      timestamp: "2026-09-12T00:00:00.000Z",
      role: "user",
      parts: [{ type: "text", text: "requested focus" }],
    },
  ]
  let resolveFocus!: (response: Response) => void
  const controller = new SessionViewController(
    "A",
    initial,
    (async (input) =>
      String(input).includes("focusId=")
        ? new Promise<Response>((resolve) => {
            resolveFocus = resolve
          })
        : new Response(JSON.stringify(appended))) as typeof fetch,
    () => new Source(),
    scheduler
  )

  const focus = controller.revealEntry("requested-focus")
  await controller.refresh()
  resolveFocus(new Response(JSON.stringify(focused)))
  await focus
  assert.deepEqual(
    controller.store.getTranscript()?.entries.map((entry) => entry.id),
    ["requested-focus"]
  )
  controller.dispose()
})

test("a newer focus supersedes an in-flight show latest request", async () => {
  const initial = view("A")
  initial.snapshot.history = {
    ...initial.snapshot.history!,
    leafId: "latest",
    entryIds: ["latest"],
    sourceHash: "same-file",
    atLatest: false,
  }
  const latest = structuredClone(initial)
  latest.snapshot.history = {
    ...latest.snapshot.history!,
    extendsLeaf: true,
    atLatest: true,
  }
  const focused = structuredClone(initial.snapshot)
  focused.entries = [
    {
      kind: "message",
      id: "focus-target",
      timestamp: "2026-09-12T00:00:00.000Z",
      role: "user",
      parts: [{ type: "text", text: "focused" }],
    },
  ]
  let resolveLatest!: (response: Response) => void
  const controller = new SessionViewController(
    "A",
    initial,
    (async (input) =>
      String(input).includes("/view?")
        ? new Promise<Response>((resolve) => {
            resolveLatest = resolve
          })
        : new Response(JSON.stringify(focused))) as typeof fetch,
    () => new Source(),
    scheduler
  )

  const showLatest = controller.showLatest()
  await controller.revealEntry("focus-target")
  resolveLatest(new Response(JSON.stringify(latest)))
  await showLatest
  assert.equal(controller.store.getTranscript()?.history?.atLatest, false)
  assert.deepEqual(
    controller.store.getTranscript()?.entries.map((entry) => entry.id),
    ["focus-target"]
  )
  assert.equal(controller.store.getFollowRequest(), 0)
  controller.dispose()
})

test("a cold entry hash waits for the event checkpoint and initial transcript", async () => {
  const source = new Source()
  const urls: string[] = []
  const initial = view("cold-hash", 1, "ready")
  initial.snapshot.history!.leafId = "latest"
  initial.snapshot.history!.entryIds = ["latest"]
  const focused = structuredClone(initial.snapshot)
  focused.history!.atLatest = false
  focused.entries = [
    {
      kind: "message",
      id: "older-entry",
      timestamp: "2026-09-12T00:00:00.000Z",
      role: "user",
      parts: [{ type: "text", text: "older" }],
    },
  ]
  const controller = new SessionViewController(
    "cold-hash",
    null,
    (async (input) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify(String(input).includes("/view?") ? initial : focused)
      )
    }) as typeof fetch,
    () => source,
    scheduler
  )

  const reveal = controller.revealHash("#entry-older-entry")
  assert.equal(urls.length, 0)
  controller.retain()
  source.emit(1, "stream.checkpoint", { cursor: cursor(1) })
  await reveal
  assert.equal(urls.length, 2)
  assert.ok(urls[0]?.includes("/view?"))
  assert.ok(urls[1]?.includes("focusId=older-entry"))
  assert.equal(controller.store.getTranscript()?.entries[0]?.id, "older-entry")
  assert.equal(controller.revealedHash, "#entry-older-entry")
  assert.equal(controller.getMetadata().error, null)
  controller.dispose()
})

test("show latest supersedes a cold hash before its initial checkpoint", async () => {
  const source = new Source()
  const latest = view("cold-latest", 1, "ready")
  let historyRequests = 0
  const controller = new SessionViewController(
    "cold-latest",
    null,
    (async (input) => {
      if (String(input).includes("/history?")) historyRequests++
      return new Response(JSON.stringify(latest))
    }) as typeof fetch,
    () => source,
    scheduler
  )

  const oldReveal = controller.revealHash("#entry-stale")
  controller.retain()
  await controller.showLatest()
  source.emit(1, "stream.checkpoint", { cursor: cursor(1) })
  await oldReveal
  assert.equal(historyRequests, 0)
  assert.equal(controller.revealedHash, null)
  assert.equal(controller.store.getTranscript()?.history?.atLatest, true)
  assert.equal(controller.getMetadata().error, null)
  controller.dispose()
})

test("disposing a cold hash owner cancels its pending reveal", async () => {
  let requests = 0
  const controller = new SessionViewController(
    "cold-disposed",
    null,
    (async () => {
      requests++
      throw new Error("Disposed hash must not request history")
    }) as typeof fetch,
    () => new Source(),
    scheduler
  )

  const reveal = controller.revealHash("#entry-unmounted")
  controller.dispose()
  await reveal
  assert.equal(requests, 0)
  assert.equal(controller.revealedHash, null)
  assert.equal(controller.getMetadata().error, null)
})
