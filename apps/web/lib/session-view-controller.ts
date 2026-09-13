import { responseJson } from "./api-response"
import { SessionEventStream } from "./session-event-stream"
import {
  applySessionLiveEvent,
  compareEventCursors,
  parseSessionLiveEvent,
  STREAM_EVENT_TYPES,
  type SessionLiveEvent,
} from "./session-live-events"
import { SessionStreamStore, type FrameScheduler } from "./session-stream-store"
import type { SessionSnapshot, TranscriptEntry } from "./session-types"
import type { SessionView } from "./session-view-types"

export interface SessionScrollPosition {
  top: number
  following: boolean
  anchorId: string | null
  anchorOffset: number
}

function coalesce(buffer: SessionLiveEvent[], event: SessionLiveEvent) {
  const last = buffer.at(-1)
  if (last?.type === "session.message.update" && event.type === last.type) {
    const oldRole = (last.payload as { message: { role: string } }).message.role
    const newRole = (event.payload as { message: { role: string } }).message
      .role
    if (oldRole === newRole) {
      buffer[buffer.length - 1] = event
      return
    }
  }
  buffer.push(event)
}

export class SessionViewController {
  readonly events: SessionEventStream
  readonly store: SessionStreamStore
  readonly initialView: SessionView
  scroll: SessionScrollPosition | null = null
  pendingAnchor: SessionScrollPosition | null = null
  captureAnchor: (() => SessionScrollPosition) | null = null
  users = 0
  lastUsed = 0
  followedRequest = 0
  revealedHash: string | null = null
  private cursor: string
  private replay: SessionLiveEvent[] | null = null
  private refreshRequest: Promise<void> | null = null
  private refreshAgain = false
  private historyRequest: Promise<void> | null = null
  private dropHistory = false
  private forceFollow = false
  private metadata = { loadingEarlier: false, error: null as string | null }
  private readonly listeners = new Set<() => void>()

  constructor(
    readonly sessionId: string,
    initial: SessionView,
    private readonly request: typeof fetch = (...args) => globalThis.fetch(...args),
    factory?: ConstructorParameters<typeof SessionEventStream>[2],
    scheduler?: FrameScheduler
  ) {
    this.initialView = initial
    this.cursor = initial.eventCursor
    this.store = new SessionStreamStore(scheduler)
    this.store.restore(initial.live, initial.snapshot)
    this.events = new SessionEventStream(
      sessionId,
      initial.eventCursor,
      factory,
      true
    )
    this.events.subscribe(
      [...STREAM_EVENT_TYPES, "session.entry.appended"],
      (source) => {
        try {
          const event = parseSessionLiveEvent(source)
          const order = compareEventCursors(event.id, this.cursor)
          if (order !== null && order <= 0 && event.type !== "resync.required")
            return
          this.cursor = event.id
          if (this.replay) coalesce(this.replay, event)
          applySessionLiveEvent(this.store, event)
          if (event.type === "session.leaf.changed") this.dropHistory = true
          if (
            [
              "session.completed",
              "session.leaf.changed",
              "resync.required",
              "runtime.stopped",
              "runtime.crashed",
            ].includes(event.type) ||
            (event.type === "session.entry.appended" &&
              this.store.getRuntimeStatus() !== "busy")
          ) {
            void this.refresh().catch(() => undefined)
          }
        } catch (error) {
          this.setError(error)
        }
      }
    )
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getMetadata = () => this.metadata
  private setError(error: unknown) {
    this.metadata = {
      ...this.metadata,
      error: error instanceof Error ? error.message : String(error),
    }
    for (const listener of this.listeners) listener()
  }

  retain(initial = this.initialView) {
    this.users++
    this.lastUsed = Date.now()
    this.events.open()
    this.acceptInitial(initial)
  }

  acceptInitial(initial: SessionView) {
    const current = this.store.getTranscript()
    const order = compareEventCursors(initial.eventCursor, this.cursor)
    if (order !== null && order < 0) return
    if (
      order === null ||
      order > 0 ||
      initial.snapshot.history?.sourceHash !== current?.history?.sourceHash ||
      initial.snapshot.history?.leafId !== current?.history?.leafId
    )
      void this.refresh().catch(() => undefined)
  }

  release() {
    this.users = Math.max(0, this.users - 1)
    this.lastUsed = Date.now()
    if (!this.users && !this.active()) this.events.pause()
  }

  active() {
    return ["busy", "starting", "stopping"].includes(
      this.store.getRuntimeStatus() ?? "stopped"
    )
  }
  dispose() {
    this.events.close()
    this.store.dispose()
    this.listeners.clear()
  }

  private async page(cursor: string): Promise<SessionSnapshot> {
    return responseJson(
      await this.request(
        `/api/v1/sessions/${this.sessionId}/history?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" }
      )
    )
  }

  refresh = () => {
    if (this.refreshRequest) {
      this.refreshAgain = true
      return this.refreshRequest
    }
    this.refreshRequest = this.refreshNow().finally(() => {
      this.refreshRequest = null
      if (this.refreshAgain) {
        this.refreshAgain = false
        void this.refresh().catch(() => undefined)
      }
      if (!this.users && !this.active()) this.events.pause()
    })
    return this.refreshRequest
  }

  private async refreshNow() {
    const buffered: SessionLiveEvent[] = []
    this.replay = buffered
    try {
      if (this.historyRequest) await this.historyRequest
      const previous = this.store.getTranscript()
      const previousLeaf = previous?.history?.leafId ?? null
      const query = new URLSearchParams({ previousLeaf: previousLeaf ?? "" })
      const view = await responseJson<SessionView>(
        await this.request(`/api/v1/sessions/${this.sessionId}/view?${query}`, {
          cache: "no-store",
        })
      )
      let transcript = view.snapshot
      if (
        previous &&
        !this.dropHistory &&
        previous.history?.atLatest === false &&
        transcript.history?.extendsLeaf &&
        transcript.history.generation === previous.history.generation
      ) {
        transcript = {
          ...transcript,
          entries: previous.entries,
          history: previous.history,
        }
      } else if (
        previous &&
        !this.dropHistory &&
        transcript.history?.leafId === previousLeaf &&
        transcript.history?.sourceHash === previous.history?.sourceHash
      ) {
        transcript = {
          ...transcript,
          entries: previous.entries,
          history: previous.history,
        }
      } else if (
        previous &&
        !this.dropHistory &&
        transcript.history?.extendsLeaf &&
        transcript.history.generation === previous.history?.generation
      ) {
        let page = transcript
        const additions: TranscriptEntry[] = []
        for (;;) {
          const ids = page.history?.entryIds ?? []
          const boundary =
            previousLeaf === null ? -1 : ids.indexOf(previousLeaf)
          const selected =
            boundary === -1
              ? page.entries
              : page.entries.filter((entry) => ids.indexOf(entry.id) > boundary)
          additions.unshift(...selected)
          if (boundary !== -1 || !page.history?.nextCursor) break
          page = await this.page(page.history.nextCursor)
        }
        const entries = new Map(
          previous.entries.map((entry) => [entry.id, entry])
        )
        for (const entry of additions) entries.set(entry.id, entry)
        transcript = {
          ...transcript,
          entries: [...entries.values()],
          history: {
            ...transcript.history!,
            nextCursor: previous.history?.nextCursor ?? null,
            boundary: previous.history!.boundary,
          },
        }
      }
      this.pendingAnchor = this.captureAnchor?.() ?? null
      if (this.forceFollow) {
        this.pendingAnchor = {
          top: 0,
          following: true,
          anchorId: null,
          anchorOffset: 0,
        }
        this.forceFollow = false
      }
      this.store.restore(view.live, transcript, false)
      for (const event of buffered) {
        const order = compareEventCursors(event.id, view.eventCursor)
        if (order !== null && order > 0)
          applySessionLiveEvent(this.store, event)
      }
      const order = compareEventCursors(view.eventCursor, this.cursor)
      if (order === null || order > 0) this.cursor = view.eventCursor
      this.events.setCursor(view.eventCursor)
      this.dropHistory = false
      this.store.flush()
      this.metadata = { ...this.metadata, error: null }
      for (const listener of this.listeners) listener()
    } catch (error) {
      this.setError(error)
      throw error
    } finally {
      if (this.replay === buffered) this.replay = null
    }
  }

  loadEarlier = (reveal = false) => {
    if (this.historyRequest) return this.historyRequest
    const cursor = this.store.getTranscript()?.history?.nextCursor
    if (!cursor) return Promise.resolve()
    this.metadata = { loadingEarlier: true, error: null }
    for (const listener of this.listeners) listener()
    this.historyRequest = (async () => {
      try {
        const page = await this.page(cursor)
        const current = this.store.getTranscript()!
        if (current.history?.nextCursor !== cursor) return
        this.pendingAnchor = this.captureAnchor?.() ?? null
        if (reveal && page.entries[0])
          this.pendingAnchor = {
            top: 0,
            following: false,
            anchorId: `entry-${page.entries[0].id}`,
            anchorOffset: 0,
          }
        const entries = new Map(page.entries.map((entry) => [entry.id, entry]))
        for (const entry of current.entries) entries.set(entry.id, entry)
        this.store.setTranscript({
          ...current,
          entries: [...entries.values()],
          history: {
            ...current.history!,
            nextCursor: page.history?.nextCursor ?? null,
            boundary: page.history!.boundary,
          },
        })
      } catch (error) {
        this.setError(error)
      } finally {
        this.historyRequest = null
        this.metadata = { ...this.metadata, loadingEarlier: false }
        for (const listener of this.listeners) listener()
      }
    })()
    return this.historyRequest
  }

  async loadEntry(entryId: string) {
    try {
      const current = this.store.getTranscript()!
      const cursor = current.history?.leafId
      const query = new URLSearchParams({ entryId })
      if (current.history?.anchorCursor)
        query.set("cursor", current.history.anchorCursor)
      // Loading a deferred record is an explicit action against its native ID.
      const page = await responseJson<SessionSnapshot>(
        await this.request(
          `/api/v1/sessions/${this.sessionId}/history?${query}`,
          { cache: "no-store" }
        )
      )
      const latest = this.store.getTranscript()!
      if (latest.history?.leafId !== cursor) return
      this.pendingAnchor = this.captureAnchor?.() ?? null
      this.store.setTranscript({
        ...latest,
        entries: latest.entries.flatMap((entry) =>
          entry.id === entryId ? page.entries : [entry]
        ),
      })
    } catch (error) {
      this.setError(error)
    }
  }

  async revealEntry(entryId: string) {
    try {
      const current = this.store.getTranscript()!
      if (!current.entries.some((entry) => entry.id === entryId)) {
        const params = new URLSearchParams({ focusId: entryId })
        if (current.history?.anchorCursor)
          params.set("cursor", current.history.anchorCursor)
        const page = await responseJson<SessionSnapshot>(
          await this.request(
            `/api/v1/sessions/${this.sessionId}/history?${params}`,
            { cache: "no-store" }
          )
        )
        this.pendingAnchor = {
          top: 0,
          following: false,
          anchorId: `entry-${entryId}`,
          anchorOffset: 0,
        }
        this.store.setTranscript(page)
      } else {
        this.pendingAnchor = {
          top: 0,
          following: false,
          anchorId: `entry-${entryId}`,
          anchorOffset: 0,
        }
        this.store.setTranscript({ ...current })
      }
    } catch (error) {
      this.setError(error)
    }
  }

  async revealHash(hash: string) {
    if (!hash.startsWith("#entry-") || this.revealedHash === hash) return
    try {
      const id = decodeURIComponent(hash.slice("#entry-".length))
      this.revealedHash = hash
      await this.revealEntry(id)
    } catch (error) {
      this.setError(error)
    }
  }

  showLatest = async () => {
    this.dropHistory = true
    this.forceFollow = true
    this.revealedHash = null
    await this.refresh()
    this.store.requestFollow()
  }
}
