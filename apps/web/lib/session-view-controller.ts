import { responseJson } from "./api-response"
import { compactionEndOutcome } from "./compaction-events"
import {
  SessionRuntimeController,
  type SessionRuntimeControllerOptions,
} from "./session-runtime-controller"
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

export interface SessionViewControllerOptions {
  idleGraceMs?: number
  setTimer?: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
  runtime?: SessionRuntimeControllerOptions
}

export const MAX_IDLE_SESSION_STREAMS = 1
export const IDLE_SESSION_STREAM_GRACE_MS = 1_500
const idleSessionStreams = new Map<SessionViewController, number>()
const sessionControllers = new Set<SessionViewController>()
let idleTransportSuspensions = 0
const RUNTIME_PRESENTATION_EVENT_TYPES = [
  "runtime.starting",
  "runtime.ready",
  "runtime.busy",
  "runtime.idle",
  "runtime.stopping",
  "runtime.stopped",
  "runtime.crashed",
  "session.completed",
  "session.leaf.changed",
  "queue.updated",
  "compaction.start",
  "compaction.end",
  "retry.start",
  "retry.end",
  "extension.ui.request",
  "extension.ui.closed",
  "tui.surface",
  "resync.required",
] as const

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
  readonly runtime: SessionRuntimeController
  private currentView: SessionView | null
  private pendingSessionSummary: Partial<
    Pick<
      SessionSnapshot["session"],
      "title" | "isPinned" | "hasUnreadCompletion"
    >
  > = {}
  private pendingSessionSummaryRevisions: Partial<
    Record<"title" | "isPinned" | "hasUnreadCompletion", number>
  > = {}
  private sessionSummaryRevision = 0
  scroll: SessionScrollPosition | null = null
  pendingAnchor: SessionScrollPosition | null = null
  captureAnchor: (() => SessionScrollPosition) | null = null
  users = 0
  lastUsed = 0
  followedRequest = 0
  revealedHash: string | null = null
  private cursor: string | null
  private replay: SessionLiveEvent[] | null = null
  private refreshRequest: Promise<void> | null = null
  private refreshAgain = false
  private refreshAgainCursor: string | null = null
  private historyRequest: Promise<void> | null = null
  private dropHistory = false
  private forceFollow = false
  private metadata = { loadingEarlier: false, error: null as string | null }
  private readonly listeners = new Set<() => void>()
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private idleGeneration = 0
  private initialLoadRequest: Promise<void> | null = null
  private pendingNativeFileRevision: string | null = null
  private inFlightNativeFileRevision: string | null = null
  private syncedNativeFileRevision: string | null = null
  private readonly idleGraceMs: number
  private readonly setTimer: (
    callback: () => void,
    delayMs: number
  ) => ReturnType<typeof setTimeout>
  private readonly clearTimer: (handle: ReturnType<typeof setTimeout>) => void

  constructor(
    readonly sessionId: string,
    initial: SessionView | null,
    private readonly request: typeof fetch = (...args) =>
      globalThis.fetch(...args),
    factory?: ConstructorParameters<typeof SessionEventStream>[2],
    scheduler?: FrameScheduler,
    options: SessionViewControllerOptions = {}
  ) {
    this.currentView = initial
    this.cursor = initial?.eventCursor ?? null
    this.idleGraceMs = options.idleGraceMs ?? IDLE_SESSION_STREAM_GRACE_MS
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))
    this.store = new SessionStreamStore(scheduler)
    if (initial) this.store.restore(initial.live, initial.snapshot)
    this.runtime = new SessionRuntimeController(
      sessionId,
      initial?.runtime ?? null,
      options.runtime
    )
    if (initial) this.runtime.acceptRuntimeEventCursor(initial.eventCursor)
    this.events = new SessionEventStream(sessionId, this.cursor, factory, true)
    this.events.subscribe(
      [...STREAM_EVENT_TYPES, "session.entry.appended"],
      (source) => {
        try {
          const event = parseSessionLiveEvent(source)
          const order =
            this.cursor === null
              ? null
              : compareEventCursors(event.id, this.cursor)
          if (order !== null && order <= 0 && event.type !== "resync.required")
            return
          this.cursor = event.id
          if (this.replay) coalesce(this.replay, event)
          applySessionLiveEvent(this.store, event)
          if (event.type === "session.leaf.changed") this.dropHistory = true
          const shouldRefresh =
            [
              "session.completed",
              "session.leaf.changed",
              "resync.required",
              "runtime.stopped",
              "runtime.crashed",
            ].includes(event.type) ||
            (event.type === "session.entry.appended" &&
              this.store.getRuntimeStatus() !== "busy") ||
            (event.type === "compaction.end" &&
              compactionEndOutcome(event.payload).kind === "complete")
          if (shouldRefresh) void this.refresh(event.id).catch(() => undefined)
          this.updateConnectionRetention()
        } catch (error) {
          this.setError(error)
        }
      }
    )
    this.events.subscribe(RUNTIME_PRESENTATION_EVENT_TYPES, (source) => {
      try {
        this.runtime.applyEvent(parseSessionLiveEvent(source))
      } catch (error) {
        this.setError(error)
      }
    })
    sessionControllers.add(this)
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getView = () => this.currentView
  get initialView() {
    return this.currentView
  }
  whenEventCheckpointReady = () => this.events.waitForCheckpoint()
  updateSessionSummary(
    summary: Partial<
      Pick<
        SessionSnapshot["session"],
        "title" | "isPinned" | "hasUnreadCompletion"
      >
    >
  ) {
    const revision = ++this.sessionSummaryRevision
    if (summary.title !== undefined) {
      this.pendingSessionSummary.title = summary.title
      this.pendingSessionSummaryRevisions.title = revision
    }
    if (summary.isPinned !== undefined) {
      this.pendingSessionSummary.isPinned = summary.isPinned
      this.pendingSessionSummaryRevisions.isPinned = revision
    }
    if (summary.hasUnreadCompletion !== undefined) {
      this.pendingSessionSummary.hasUnreadCompletion =
        summary.hasUnreadCompletion
      this.pendingSessionSummaryRevisions.hasUnreadCompletion = revision
    }
    if (!this.currentView) return
    this.currentView = {
      ...this.currentView,
      snapshot: {
        ...this.currentView.snapshot,
        session: { ...this.currentView.snapshot.session, ...summary },
      },
    }
    for (const listener of this.listeners) listener()
  }
  getMetadata = () => this.metadata
  private setError(error: unknown) {
    this.metadata = {
      ...this.metadata,
      error: error instanceof Error ? error.message : String(error),
    }
    for (const listener of this.listeners) listener()
  }

  retain(initial = this.initialView, selectedNativeFileRevision?: string) {
    const needsSelectedFileSync =
      selectedNativeFileRevision !== undefined &&
      selectedNativeFileRevision !== this.syncedNativeFileRevision &&
      selectedNativeFileRevision !== this.inFlightNativeFileRevision
    if (needsSelectedFileSync)
      this.pendingNativeFileRevision = selectedNativeFileRevision
    this.users++
    this.lastUsed = Date.now()
    this.cancelIdlePause()
    this.events.open()
    if (initial && this.currentView) this.acceptInitial(initial)
    if (this.currentView) {
      if (needsSelectedFileSync) void this.refresh().catch(() => undefined)
    } else {
      void this.events
        .waitForCheckpoint()
        .then(() => {
          if (this.users === 0) return
          return this.ensureInitialView()
        })
        .then(() => {
          if (this.users > 0) this.events.open()
        })
        .catch((error: unknown) => {
          if (this.users > 0) this.setError(error)
        })
    }
  }

  acceptInitial(initial: SessionView) {
    if (!this.currentView) {
      void this.refresh().catch(() => undefined)
      return
    }
    const current = this.store.getTranscript()
    const order =
      this.cursor === null
        ? null
        : compareEventCursors(initial.eventCursor, this.cursor)
    if (order !== null && order < 0) return
    if (order === null || order > 0) {
      void this.refresh(initial.eventCursor).catch(() => undefined)
    } else if (
      initial.snapshot.history?.sourceHash !== current?.history?.sourceHash ||
      initial.snapshot.history?.leafId !== current?.history?.leafId
    ) {
      void this.refresh().catch(() => undefined)
    }
  }

  release() {
    this.users = Math.max(0, this.users - 1)
    this.lastUsed = Date.now()
    this.updateConnectionRetention()
  }

  active() {
    return ["busy", "starting", "stopping"].includes(
      this.store.getRuntimeStatus() ?? "stopped"
    )
  }
  dispose() {
    this.cancelIdlePause()
    this.events.close()
    this.store.dispose()
    this.runtime.dispose()
    this.listeners.clear()
    sessionControllers.delete(this)
  }

  private async page(cursor: string): Promise<SessionSnapshot> {
    return responseJson(
      await this.request(
        `/api/v1/sessions/${this.sessionId}/history?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" }
      )
    )
  }

  refresh = (eventCursor?: string) => {
    if (this.refreshRequest) {
      if (eventCursor === undefined) {
        this.refreshAgain = true
      } else if (
        this.refreshAgainCursor === null ||
        [null, 1].includes(
          compareEventCursors(eventCursor, this.refreshAgainCursor)
        )
      ) {
        this.refreshAgainCursor = eventCursor
      }
      return this.refreshRequest
    }
    this.refreshRequest = this.refreshNow().finally(() => {
      const forceRefreshAgain = this.refreshAgain
      const requestedCursor = this.refreshAgainCursor
      this.refreshRequest = null
      this.refreshAgain = false
      this.refreshAgainCursor = null
      if (
        forceRefreshAgain ||
        (requestedCursor !== null && !this.currentViewCovers(requestedCursor))
      ) {
        void this.refresh(
          forceRefreshAgain ? undefined : (requestedCursor ?? undefined)
        ).catch(() => undefined)
      }
      this.updateConnectionRetention()
    })
    return this.refreshRequest
  }

  refreshSelectedFile = (nativeFileRevision: string) => {
    if (
      nativeFileRevision === this.syncedNativeFileRevision ||
      nativeFileRevision === this.inFlightNativeFileRevision
    ) {
      return this.refreshRequest ?? Promise.resolve()
    }
    this.pendingNativeFileRevision = nativeFileRevision
    return this.refresh()
  }

  private currentViewCovers(cursor: string) {
    if (!this.currentView) return false
    const order = compareEventCursors(cursor, this.currentView.eventCursor)
    return order === null || order <= 0
  }

  private async refreshNow() {
    const buffered: SessionLiveEvent[] = []
    const summaryRevisionAtRequest = this.sessionSummaryRevision
    const nativeFileRevision = this.pendingNativeFileRevision
    this.pendingNativeFileRevision = null
    this.inFlightNativeFileRevision = nativeFileRevision
    this.replay = buffered
    try {
      if (this.historyRequest) await this.historyRequest
      const runtimeGeneration = this.runtime.getGeneration()
      const previous = this.store.getTranscript()
      const previousLeaf = previous?.history?.leafId ?? null
      const query = new URLSearchParams({ previousLeaf: previousLeaf ?? "" })
      if (nativeFileRevision !== null) query.set("syncSelectedFile", "1")
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
      const order =
        this.cursor === null
          ? null
          : compareEventCursors(view.eventCursor, this.cursor)
      if (this.cursor === null || order === null || order > 0)
        this.cursor = view.eventCursor
      this.dropHistory = false
      this.store.flush()
      if (runtimeGeneration === this.runtime.getGeneration()) {
        this.runtime.setAuthoritativeState(view.runtime, view.eventCursor)
      }
      const summaryPatch: Partial<
        Pick<
          SessionSnapshot["session"],
          "title" | "isPinned" | "hasUnreadCompletion"
        >
      > = {}
      for (const field of [
        "title",
        "isPinned",
        "hasUnreadCompletion",
      ] as const) {
        const revision = this.pendingSessionSummaryRevisions[field]
        if (revision === undefined) continue
        if (revision > summaryRevisionAtRequest) {
          if (field === "title")
            summaryPatch.title = this.pendingSessionSummary.title
          else if (field === "isPinned")
            summaryPatch.isPinned = this.pendingSessionSummary.isPinned
          else
            summaryPatch.hasUnreadCompletion =
              this.pendingSessionSummary.hasUnreadCompletion
        }
        delete this.pendingSessionSummaryRevisions[field]
        delete this.pendingSessionSummary[field]
      }
      const nextSnapshot = Object.keys(summaryPatch).length
        ? { ...transcript, session: { ...transcript.session, ...summaryPatch } }
        : transcript
      this.currentView = {
        ...view,
        snapshot: nextSnapshot,
        live: this.store.capture(),
        runtime: {
          ...view.runtime,
          status: this.store.getRuntimeStatus() ?? view.runtime.status,
        },
      }
      if (nativeFileRevision !== null)
        this.syncedNativeFileRevision = nativeFileRevision
      this.metadata = { ...this.metadata, error: null }
      for (const listener of this.listeners) listener()
    } catch (error) {
      this.setError(error)
      throw error
    } finally {
      if (this.inFlightNativeFileRevision === nativeFileRevision)
        this.inFlightNativeFileRevision = null
      if (this.replay === buffered) this.replay = null
    }
  }

  private cancelIdlePause() {
    this.idleGeneration++
    idleSessionStreams.delete(this)
    if (this.idleTimer !== null) {
      this.clearTimer(this.idleTimer)
      this.idleTimer = null
    }
  }

  private pauseIfIdle() {
    this.idleGeneration++
    idleSessionStreams.delete(this)
    if (this.idleTimer !== null) this.clearTimer(this.idleTimer)
    this.idleTimer = null
    if (this.users === 0) this.events.pause()
  }

  private ensureInitialView() {
    if (this.currentView) return Promise.resolve()
    if (this.initialLoadRequest) return this.initialLoadRequest
    this.initialLoadRequest = this.refresh().finally(() => {
      this.initialLoadRequest = null
    })
    return this.initialLoadRequest
  }

  private updateConnectionRetention() {
    if (this.users > 0) {
      this.cancelIdlePause()
      return
    }
    if (idleTransportSuspensions > 0) {
      this.pauseIfIdle()
      return
    }
    if (this.idleTimer !== null) return

    idleSessionStreams.set(this, Date.now())
    const generation = ++this.idleGeneration
    this.idleTimer = this.setTimer(() => {
      if (generation !== this.idleGeneration) return
      this.pauseIfIdle()
    }, this.idleGraceMs)
    while (idleSessionStreams.size > MAX_IDLE_SESSION_STREAMS) {
      const oldest = idleSessionStreams.keys().next().value
      if (!oldest) break
      oldest.pauseIfIdle()
    }
  }

  pauseIdleTransport() {
    this.pauseIfIdle()
  }

  retainIdleTransport() {
    if (this.users === 0) this.updateConnectionRetention()
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

/**
 * Suspend only unmounted session event streams while a terminal owns a long-
 * lived connection. Runtime workers continue running; a later retain reconnects
 * from the last cursor and the normal resync path repairs any expired gap.
 */
export function suspendIdleSessionEventStreams() {
  idleTransportSuspensions++
  if (idleTransportSuspensions === 1) {
    for (const controller of sessionControllers) {
      if (controller.users === 0) controller.pauseIdleTransport()
    }
  }
  let released = false
  return () => {
    if (released) return
    released = true
    idleTransportSuspensions = Math.max(0, idleTransportSuspensions - 1)
    if (idleTransportSuspensions !== 0) return
    const mostRecentIdle = [...sessionControllers]
      .filter((controller) => controller.users === 0)
      .sort((left, right) => right.lastUsed - left.lastUsed)
      .slice(0, MAX_IDLE_SESSION_STREAMS)
    for (const controller of mostRecentIdle) controller.retainIdleTransport()
  }
}
