import assert from "node:assert/strict"
import test from "node:test"
import { SessionViewController } from "./session-view-controller"
import { RuntimeLiveState } from "./runtime-live"
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
function view(id: string, sequence = 0): SessionView {
  return {
    eventCursor: cursor(sequence),
    runtime: { status: "busy", snapshot: null },
    live: {
      messages: [],
      tools: [],
      activeMessageIds: [],
      nextMessageId: 0,
      runtimeStatus: "busy",
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
    scheduler
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
  assert.equal(sources[0]!.closed, true)
  a.retain(next)
  assert.ok(urls.at(-1)?.includes(encodeURIComponent(cursor(4))))
  sources.at(-1)!.emit(5, "runtime.busy")
  sources.at(-1)!.emit(6, "session.message.start", message("next"))
  a.store.flush()
  assert.equal(a.store.getMessages()[0]!.id, 2)
  a.dispose()
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
