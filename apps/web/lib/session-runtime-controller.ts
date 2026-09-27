import {
  type ExtensionUIRequest,
  runtimeSnapshotSchema,
  runtimeStatusSchema,
  extensionUIRequestSchema,
  queueUpdatedEventSchema,
  tuiSurfaceEventSchema,
  type QueuedPromptItem,
  type RuntimeSnapshot,
  type RuntimeStatus,
  type TuiSurfaceSnapshot,
  type TuiSurfaceEvent,
} from "@workspace/runtime-protocol"

import { responseJson } from "@/lib/api-response"
import { compactionEndOutcome } from "@/lib/compaction-events"
import { compareEventCursors } from "@/lib/session-live-events"
import {
  createRuntimeLeaseId,
  RuntimeLeaseController,
  type RuntimeLeaseControllerOptions,
  type RuntimeLeaseTimerHandle,
  type RuntimeLeaseTransport,
} from "@/lib/runtime-lease"
import type { SessionRuntimeLeaseResult } from "@/lib/session-runtime-types"
import type { SessionLiveEvent } from "@/lib/session-live-events"

export type RuntimeLeasePhase = "connecting" | "ready" | "error" | "paused"

export function runAfterSessionEventCheckpoint<T>(
  checkpoint: Promise<unknown>,
  load: () => Promise<T>
) {
  return checkpoint.then(load)
}

export type ActiveExtensionRequest = Extract<
  ExtensionUIRequest,
  { method: "select" | "confirm" | "input" | "editor" }
> & {
  requestId: string
  value: string
  expiresAt: number | null
}

export interface RuntimeExtensionWidget {
  lines: string[]
  placement: "aboveEditor" | "belowEditor"
}

type PendingSurfaceEvent = Extract<
  TuiSurfaceEvent,
  { kind: "write" | "title" | "progress" }
>

const RUNTIME_SNAPSHOT_EVENT_TYPES = [
  "runtime.starting",
  "runtime.ready",
  "runtime.busy",
  "runtime.idle",
  "runtime.stopping",
  "runtime.stopped",
  "runtime.crashed",
  "session.completed",
  "queue.updated",
  "compaction.start",
  "compaction.end",
] as const

function applySurfaceEvents(
  surface: TuiSurfaceSnapshot,
  events: PendingSurfaceEvent[]
) {
  return events.reduce((current, event) => {
    if (event.kind === "write") {
      return event.revision > current.revision
        ? {
            ...current,
            revision: event.revision,
            data: current.data + event.data,
          }
        : current
    }
    if (event.kind === "title") return { ...current, title: event.title }
    return { ...current, progress: event.active }
  }, surface)
}

function applyTuiSurfaceEvent(
  current: Record<string, TuiSurfaceSnapshot>,
  event: TuiSurfaceEvent,
  pending: Map<string, PendingSurfaceEvent[]>
) {
  if (event.kind === "submit") return current
  if (event.kind === "open") {
    const id = event.surface.surfaceId
    const existing = current[id]
    const base =
      existing && existing.revision >= event.surface.revision
        ? existing
        : event.surface
    const buffered = pending.get(id)
    pending.delete(id)
    return {
      ...current,
      [id]: buffered ? applySurfaceEvents(base, buffered) : base,
    }
  }
  if (event.kind === "close") {
    pending.delete(event.surfaceId)
    if (!(event.surfaceId in current)) return current
    const next = { ...current }
    delete next[event.surfaceId]
    return next
  }

  const surface = current[event.surfaceId]
  if (!surface) {
    const buffered = pending.get(event.surfaceId) ?? []
    buffered.push(event)
    pending.set(event.surfaceId, buffered)
    return current
  }
  return {
    ...current,
    [event.surfaceId]: applySurfaceEvents(surface, [event]),
  }
}

export function reconcileTuiSurfaceSnapshot(
  snapshots: readonly TuiSurfaceSnapshot[],
  pendingBeforeLoad: Map<string, PendingSurfaceEvent[]>,
  bufferedEvents: readonly TuiSurfaceEvent[]
) {
  let surfaces: Record<string, TuiSurfaceSnapshot> = {}
  const pending = new Map(
    [...pendingBeforeLoad].map(([surfaceId, events]) => [
      surfaceId,
      [...events],
    ])
  )
  for (const snapshot of snapshots) {
    const queued = pending.get(snapshot.surfaceId)
    surfaces[snapshot.surfaceId] = queued
      ? applySurfaceEvents(snapshot, queued)
      : snapshot
    pending.delete(snapshot.surfaceId)
  }
  for (const event of bufferedEvents) {
    surfaces = applyTuiSurfaceEvent(surfaces, event, pending)
  }
  return { surfaces, pending }
}

export function reconcileExtensionRequestSnapshot(
  loaded: readonly ActiveExtensionRequest[],
  buffered: readonly ActiveExtensionRequest[],
  closedRequestIds: ReadonlySet<string>,
  now: number,
  current: readonly ActiveExtensionRequest[]
) {
  const byId = new Map<string, ActiveExtensionRequest>()
  for (const request of [...loaded, ...buffered]) {
    if (
      closedRequestIds.has(request.requestId) ||
      (request.expiresAt !== null && request.expiresAt <= now)
    ) {
      continue
    }
    byId.set(request.requestId, request)
  }
  return [...byId.values()].map((request) => {
    const existing = current.find(
      (candidate) => candidate.requestId === request.requestId
    )
    return existing ? { ...request, value: existing.value } : request
  })
}

export function activeExtensionRequest(
  requestId: string,
  request: ExtensionUIRequest,
  expiresAt: number | null
): ActiveExtensionRequest {
  if (
    request.method !== "select" &&
    request.method !== "confirm" &&
    request.method !== "input" &&
    request.method !== "editor"
  ) {
    throw new Error("Runtime returned a non-blocking extension UI request.")
  }
  return {
    ...request,
    requestId,
    value:
      request.method === "editor"
        ? (request.prefill ?? "")
        : request.method === "select"
          ? (request.options[0] ?? "")
          : "",
    expiresAt,
  }
}

export interface SessionRuntimePresentation {
  leasePhase: RuntimeLeasePhase
  leaseError: string | null
  snapshot: RuntimeSnapshot | null | undefined
  status: RuntimeStatus | null
  queuedMessages: QueuedPromptItem[]
  queueRevision: number
  compacting: boolean
  compactionNotice: "running" | "complete" | null
  compactQueuedOptimistic: boolean
  retrying: string | null
  extensionRequests: ActiveExtensionRequest[]
  extensionStatuses: Record<string, string>
  extensionWidgets: Record<string, RuntimeExtensionWidget>
  tuiSurfaces: Record<string, TuiSurfaceSnapshot>
}

export interface SessionRuntimeControllerOptions extends RuntimeLeaseControllerOptions {
  fetch?: typeof fetch
  leaseId?: () => string
  leaseRetentionMs?: number
}

const DEFAULT_LEASE_RETENTION_MS = 120_000

function runtimeStatePayload(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("status" in value) ||
    !("snapshot" in value)
  ) {
    throw new Error("Runtime returned an invalid state response.")
  }
  return {
    status: runtimeStatusSchema.parse(value.status),
    snapshot:
      value.snapshot === null
        ? null
        : runtimeSnapshotSchema.parse(value.snapshot),
  }
}

export class SessionRuntimeController {
  private readonly listeners = new Set<() => void>()
  private state: SessionRuntimePresentation
  private readonly initialState: SessionRuntimePresentation
  private lease: RuntimeLeaseController<SessionRuntimeLeaseResult> | null = null
  private leaseId: string | null = null
  private leaseStarted = false
  private leaseReferences = 0
  private releaseTimer: RuntimeLeaseTimerHandle | null = null
  private mutationToken = ""
  private runtimeGeneration = 0
  private runtimeEventCursor: string | null = null
  private tuiGeneration = 0
  private extensionRequestGeneration = 0
  private runtimeStateLoadSequence = 0
  private tuiLoadSequence = 0
  private extensionRequestLoadSequence = 0
  private readonly fetcher: typeof fetch
  private readonly makeLeaseId: () => string
  private readonly leaseRetentionMs: number
  private readonly setTimer: (
    callback: () => void,
    delayMs: number
  ) => RuntimeLeaseTimerHandle
  private readonly clearTimer: (handle: RuntimeLeaseTimerHandle) => void
  private pendingSurfaceEvents = new Map<string, PendingSurfaceEvent[]>()
  private draftWriter: ((text: string) => void) | null = null
  private retryFormatter: (payload: unknown) => string = (payload) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("attempt" in payload) ||
      typeof payload.attempt !== "number" ||
      !("maxAttempts" in payload) ||
      typeof payload.maxAttempts !== "number"
    ) {
      throw new Error("Runtime emitted an invalid retry event.")
    }
    return `Retry ${payload.attempt}/${payload.maxAttempts}`
  }

  constructor(
    readonly sessionId: string,
    initial: { status: RuntimeStatus; snapshot: RuntimeSnapshot | null } | null,
    options: SessionRuntimeControllerOptions = {}
  ) {
    this.fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args))
    this.makeLeaseId = options.leaseId ?? createRuntimeLeaseId
    this.leaseRetentionMs =
      options.leaseRetentionMs ?? DEFAULT_LEASE_RETENTION_MS
    this.setTimer =
      options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))
    this.state = {
      leasePhase:
        initial?.status === "stopped" || initial?.status === "crashed"
          ? "paused"
          : "connecting",
      leaseError: null,
      snapshot: initial?.snapshot,
      status: initial?.status ?? null,
      queuedMessages: initial?.snapshot?.queuedPrompts ?? [],
      queueRevision: 0,
      compacting: initial?.snapshot?.isCompacting ?? false,
      compactionNotice: initial?.snapshot?.isCompacting ? "running" : null,
      compactQueuedOptimistic: false,
      retrying: null,
      extensionRequests: [],
      extensionStatuses: initial?.snapshot?.extensionStatuses ?? {},
      extensionWidgets: {},
      tuiSurfaces: {},
    }
    this.initialState = this.state
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state
  getInitialSnapshot = () => this.initialState
  getGeneration = () => this.runtimeGeneration
  beginRuntimeStateLoad = () => ++this.runtimeStateLoadSequence
  isCurrentRuntimeStateLoad = (sequence: number, generation: number) =>
    sequence === this.runtimeStateLoadSequence &&
    generation === this.runtimeGeneration
  advanceGeneration = () => {
    this.runtimeGeneration++
    return this.runtimeGeneration
  }

  getTuiGeneration = () => this.tuiGeneration
  advanceTuiGeneration = () => {
    this.tuiGeneration++
    return this.tuiGeneration
  }
  beginTuiLoad = () => ++this.tuiLoadSequence
  isCurrentTuiLoad = (sequence: number, generation: number) =>
    sequence === this.tuiLoadSequence && generation === this.tuiGeneration
  getExtensionRequestGeneration = () => this.extensionRequestGeneration
  advanceExtensionRequestGeneration = () => {
    this.extensionRequestGeneration++
    return this.extensionRequestGeneration
  }
  beginExtensionRequestLoad = () => ++this.extensionRequestLoadSequence
  isCurrentExtensionRequestLoad = (sequence: number, generation: number) =>
    sequence === this.extensionRequestLoadSequence &&
    generation === this.extensionRequestGeneration

  update(patch: Partial<SessionRuntimePresentation>) {
    if (
      !Object.entries(patch).some(
        ([key, value]) =>
          !Object.is(this.state[key as keyof SessionRuntimePresentation], value)
      )
    )
      return
    const next = { ...this.state, ...patch }
    this.state = next
    for (const listener of this.listeners) listener()
  }

  setSnapshot(snapshot: RuntimeSnapshot | null) {
    this.update({ snapshot })
  }

  setStatus(status: RuntimeStatus) {
    this.update({ status })
  }

  setAuthoritativeState(
    state: {
      status: RuntimeStatus
      snapshot: RuntimeSnapshot | null
    },
    eventCursor?: string
  ) {
    if (eventCursor !== undefined) this.acceptRuntimeEventCursor(eventCursor)
    if (state.status === "stopped" || state.status === "crashed") {
      this.lease?.pause()
    }
    this.update({
      leasePhase:
        state.status === "stopped" || state.status === "crashed"
          ? "paused"
          : this.state.leasePhase === "paused"
            ? "connecting"
            : this.state.leasePhase,
      status: state.status,
      snapshot: state.snapshot,
      queuedMessages: state.snapshot?.queuedPrompts ?? [],
      queueRevision: this.state.queueRevision + 1,
      compacting: state.snapshot?.isCompacting ?? false,
      compactionNotice: state.snapshot?.isCompacting ? "running" : null,
      extensionStatuses: state.snapshot?.extensionStatuses ?? {},
    })
  }

  setQueuedMessages(items: QueuedPromptItem[]) {
    this.update({
      queuedMessages: items,
      queueRevision: this.state.queueRevision + 1,
    })
  }

  setQueuedMessagesFromMutation(items: QueuedPromptItem[]) {
    this.update({ queuedMessages: items })
  }

  updateQueuedMessages(
    update:
      QueuedPromptItem[] | ((current: QueuedPromptItem[]) => QueuedPromptItem[])
  ) {
    const items =
      typeof update === "function" ? update(this.state.queuedMessages) : update
    this.setQueuedMessages(items)
  }

  setExtensionRequests(
    update:
      | ActiveExtensionRequest[]
      | ((current: ActiveExtensionRequest[]) => ActiveExtensionRequest[])
  ) {
    this.update({
      extensionRequests:
        typeof update === "function"
          ? update(this.state.extensionRequests)
          : update,
    })
  }

  setExtensionStatuses(
    update:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>)
  ) {
    this.update({
      extensionStatuses:
        typeof update === "function"
          ? update(this.state.extensionStatuses)
          : update,
    })
  }

  setExtensionWidgets(
    update:
      | Record<string, RuntimeExtensionWidget>
      | ((
          current: Record<string, RuntimeExtensionWidget>
        ) => Record<string, RuntimeExtensionWidget>)
  ) {
    this.update({
      extensionWidgets:
        typeof update === "function"
          ? update(this.state.extensionWidgets)
          : update,
    })
  }

  setTuiSurfaces(
    update:
      | Record<string, TuiSurfaceSnapshot>
      | ((
          current: Record<string, TuiSurfaceSnapshot>
        ) => Record<string, TuiSurfaceSnapshot>)
  ) {
    this.update({
      tuiSurfaces:
        typeof update === "function" ? update(this.state.tuiSurfaces) : update,
    })
  }

  setDraftWriter(writer: (text: string) => void) {
    this.draftWriter = writer
  }

  setRetryFormatter(formatter: (payload: unknown) => string) {
    this.retryFormatter = formatter
  }

  applyEvent(event: SessionLiveEvent) {
    if (this.isStaleRuntimeSnapshotEvent(event)) return
    if (
      [
        "runtime.starting",
        "runtime.ready",
        "runtime.busy",
        "runtime.idle",
        "runtime.stopping",
        "runtime.stopped",
        "runtime.crashed",
        "session.completed",
        "queue.updated",
        "compaction.start",
        "compaction.end",
      ].includes(event.type)
    ) {
      this.advanceGeneration()
    }
    if (
      [
        "runtime.starting",
        "runtime.stopped",
        "runtime.crashed",
        "resync.required",
      ].includes(event.type)
    ) {
      this.advanceTuiGeneration()
      this.advanceExtensionRequestGeneration()
    }
    if (event.type === "runtime.starting") {
      if (this.state.leasePhase === "paused") {
        this.update({ leasePhase: "connecting", status: "starting" })
        if (this.leaseReferences) this.resumeLease()
      } else {
        this.update({ status: "starting" })
      }
      this.pendingSurfaceEvents.clear()
      this.update({
        tuiSurfaces: {},
        extensionRequests: [],
        extensionStatuses: {},
        extensionWidgets: {},
        compacting: false,
        compactionNotice: null,
        retrying: null,
      })
      return
    }
    if (event.type === "runtime.ready") {
      const snapshot = runtimeSnapshotSchema.parse(event.payload)
      if (this.state.leasePhase === "paused") {
        this.update({ leasePhase: "connecting" })
        if (this.leaseReferences) this.resumeLease()
      }
      this.setSnapshot(snapshot)
      this.setStatus(
        snapshot.isStreaming || snapshot.isCompacting ? "busy" : "ready"
      )
      this.setQueuedMessages(snapshot.queuedPrompts)
      this.update({
        extensionStatuses: snapshot.extensionStatuses,
        compacting: snapshot.isCompacting,
        compactionNotice: snapshot.isCompacting ? "running" : null,
      })
      return
    }
    if (event.type === "runtime.busy") {
      this.setStatus("busy")
      return
    }
    if (event.type === "runtime.idle" || event.type === "session.completed") {
      this.update({
        status: "ready",
        ...(event.type === "session.completed" ? { retrying: null } : {}),
      })
      return
    }
    if (event.type === "runtime.stopping") {
      this.setStatus("stopping")
      return
    }
    if (event.type === "runtime.stopped" || event.type === "runtime.crashed") {
      this.pauseLease()
      this.pendingSurfaceEvents.clear()
      this.update({
        status: event.type === "runtime.stopped" ? "stopped" : "crashed",
        snapshot: event.type === "runtime.stopped" ? null : this.state.snapshot,
        queuedMessages: [],
        queueRevision: this.state.queueRevision + 1,
        tuiSurfaces: {},
        extensionRequests: [],
        extensionStatuses: {},
        extensionWidgets: {},
        compacting: false,
        compactionNotice: null,
        compactQueuedOptimistic: false,
        retrying: null,
      })
      return
    }
    if (event.type === "queue.updated") {
      this.setQueuedMessages(queueUpdatedEventSchema.parse(event.payload).items)
      return
    }
    if (event.type === "compaction.start") {
      this.update({
        compacting: true,
        compactionNotice: "running",
        status: "busy",
      })
      return
    }
    if (event.type === "compaction.end") {
      const outcome = compactionEndOutcome(event.payload)
      this.update({
        compacting: false,
        compactionNotice: outcome.kind === "complete" ? "complete" : null,
      })
      return
    }
    if (event.type === "retry.start") {
      this.update({ retrying: this.retryFormatter(event.payload) })
      return
    }
    if (event.type === "retry.end") {
      this.update({ retrying: null })
      return
    }
    if (event.type === "tui.surface") {
      const surfaceEvent = tuiSurfaceEventSchema.parse(event.payload)
      if (surfaceEvent.kind === "close" && surfaceEvent.value !== undefined) {
        this.draftWriter?.(surfaceEvent.value)
      }
      if (surfaceEvent.kind !== "submit") {
        this.setTuiSurfaces((current) =>
          applyTuiSurfaceEvent(current, surfaceEvent, this.pendingSurfaceEvents)
        )
      }
      return
    }
    if (event.type === "extension.ui.request") {
      if (
        typeof event.payload !== "object" ||
        event.payload === null ||
        !("requestId" in event.payload) ||
        typeof event.payload.requestId !== "string" ||
        !("expiresAt" in event.payload) ||
        (event.payload.expiresAt !== null &&
          typeof event.payload.expiresAt !== "number")
      ) {
        throw new Error("Runtime emitted an invalid extension UI request.")
      }
      const request = extensionUIRequestSchema.parse(event.payload)
      if (request.method === "setStatus") {
        this.setExtensionStatuses((current) => {
          const next = { ...current }
          if (request.statusText !== undefined) {
            next[request.statusKey] = request.statusText
          } else delete next[request.statusKey]
          return next
        })
      } else if (request.method === "setWidget") {
        this.setExtensionWidgets((current) => {
          const next = { ...current }
          if (request.widgetLines) {
            next[request.widgetKey] = {
              lines: request.widgetLines,
              placement: request.widgetPlacement ?? "aboveEditor",
            }
          } else delete next[request.widgetKey]
          return next
        })
      } else if (request.method === "set_editor_text") {
        this.draftWriter?.(request.text)
      } else if (
        request.method !== "notify" &&
        request.method !== "set_title"
      ) {
        const requestId = event.payload.requestId
        const active = activeExtensionRequest(
          requestId,
          request,
          event.payload.expiresAt
        )
        this.setExtensionRequests((current) => {
          const existing = current.find((item) => item.requestId === requestId)
          return existing
            ? current.map((item) =>
                item.requestId === requestId
                  ? { ...active, value: item.value }
                  : item
              )
            : [...current, active]
        })
      }
      return
    }
    if (event.type === "extension.ui.closed") {
      if (
        typeof event.payload !== "object" ||
        event.payload === null ||
        !("requestId" in event.payload) ||
        typeof event.payload.requestId !== "string"
      ) {
        throw new Error("Runtime emitted an invalid extension UI close.")
      }
      const requestId = event.payload.requestId
      this.setExtensionRequests((current) =>
        current.filter((request) => request.requestId !== requestId)
      )
      return
    }
    if (event.type === "resync.required") {
      this.pendingSurfaceEvents.clear()
      this.update({
        queuedMessages: [],
        queueRevision: this.state.queueRevision + 1,
        tuiSurfaces: {},
        extensionRequests: [],
        extensionStatuses: {},
        extensionWidgets: {},
        compacting: false,
        compactionNotice: null,
        compactQueuedOptimistic: false,
        retrying: null,
      })
      return
    }
    if (event.type === "session.leaf.changed") {
      if (
        typeof event.payload === "object" &&
        event.payload !== null &&
        "editorText" in event.payload &&
        typeof event.payload.editorText === "string"
      ) {
        this.draftWriter?.(event.payload.editorText)
      }
    }
  }

  isStaleRuntimeSnapshotEvent(event: Pick<SessionLiveEvent, "id" | "type">) {
    if (
      this.runtimeEventCursor === null ||
      !RUNTIME_SNAPSHOT_EVENT_TYPES.includes(
        event.type as (typeof RUNTIME_SNAPSHOT_EVENT_TYPES)[number]
      )
    ) {
      return false
    }
    const order = compareEventCursors(event.id, this.runtimeEventCursor)
    return order !== null && order <= 0
  }

  acceptRuntimeEventCursor(cursor: string) {
    if (this.runtimeEventCursor === null) {
      this.runtimeEventCursor = cursor
      return
    }
    const order = compareEventCursors(cursor, this.runtimeEventCursor)
    if (order === null || order >= 0) this.runtimeEventCursor = cursor
  }

  retainLease(mutationToken: string) {
    this.mutationToken = mutationToken
    this.leaseReferences++
    this.clearReleaseTimer()
    if (this.leaseStarted) {
      if (this.state.leasePhase === "connecting") this.lease?.resume()
      return
    }
    if (this.state.leasePhase === "paused") return
    this.startLease()
  }

  releaseLease() {
    this.leaseReferences = Math.max(0, this.leaseReferences - 1)
    if (this.leaseReferences || this.releaseTimer !== null) return
    this.releaseTimer = this.setTimer(() => {
      this.releaseTimer = null
      if (this.leaseReferences) return
      this.lease?.release()
      this.lease = null
      this.leaseId = null
      this.leaseStarted = false
      this.update({
        leasePhase:
          this.state.status === "stopped" || this.state.status === "crashed"
            ? "paused"
            : "connecting",
        leaseError: null,
      })
    }, this.leaseRetentionMs)
  }

  retryLease() {
    if (this.leaseReferences === 0) return
    this.update({ leasePhase: "connecting", leaseError: null })
    if (!this.lease) {
      this.leaseStarted = false
      this.startLease()
      return
    }
    this.lease.retry()
  }

  reconnectLeaseIfRunning() {
    if (
      this.state.leasePhase === "paused" ||
      this.state.status === "stopped" ||
      this.state.status === "crashed"
    ) {
      return
    }
    this.retryLease()
  }

  pauseLease() {
    this.lease?.pause()
    this.update({ leasePhase: "paused", leaseError: null })
  }

  resumeLease() {
    if (this.leaseReferences === 0) {
      this.update({ leasePhase: "connecting", leaseError: null })
      return
    }
    if (!this.lease) {
      this.leaseStarted = false
      this.startLease()
      return
    }
    this.update({ leasePhase: "connecting", leaseError: null })
    this.lease.resume()
  }

  dispose() {
    this.clearReleaseTimer()
    this.leaseReferences = 0
    this.lease?.release()
    this.lease = null
    this.leaseId = null
    this.leaseStarted = false
    this.listeners.clear()
  }

  private clearReleaseTimer() {
    if (this.releaseTimer === null) return
    this.clearTimer(this.releaseTimer)
    this.releaseTimer = null
  }

  private startLease() {
    if (this.leaseStarted || this.leaseReferences === 0) return
    try {
      this.leaseId ??= this.makeLeaseId()
    } catch (error) {
      this.update({
        leasePhase: "error",
        leaseError: error instanceof Error ? error.message : String(error),
      })
      return
    }
    this.leaseStarted = true
    this.update({ leasePhase: "connecting", leaseError: null })
    const requestLease = async (
      method: "POST" | "PUT",
      targetSessionId: string,
      leaseId: string
    ): Promise<SessionRuntimeLeaseResult> => {
      const generation = this.runtimeGeneration
      const queueRevision = this.state.queueRevision
      const response = await this.fetcher(
        `/api/v1/sessions/${targetSessionId}/runtime/lease`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": this.mutationToken,
          },
          body: JSON.stringify({ leaseId }),
          cache: "no-store",
        }
      )
      return {
        state: runtimeStatePayload(
          await responseJson<unknown>(
            response,
            `Runtime lease failed (HTTP ${response.status}).`
          )
        ),
        generation,
        queueRevision,
      }
    }

    const transport: RuntimeLeaseTransport<SessionRuntimeLeaseResult> = {
      acquire: (targetSessionId, leaseId) =>
        requestLease("POST", targetSessionId, leaseId),
      renew: (targetSessionId, leaseId) =>
        requestLease("PUT", targetSessionId, leaseId),
      release: async (targetSessionId, leaseId) => {
        const response = await this.fetcher(
          `/api/v1/sessions/${targetSessionId}/runtime/lease`,
          {
            method: "DELETE",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              "X-Pi-Web-Codex-Mutation-Token": this.mutationToken,
            },
            body: JSON.stringify({ leaseId }),
            cache: "no-store",
          }
        )
        if (!response.ok) {
          await responseJson<unknown>(
            response,
            `Runtime lease release failed (HTTP ${response.status}).`
          )
        }
      },
    }

    const callbacks = {
      onReady: (result: SessionRuntimeLeaseResult) => {
        if (this.state.leasePhase === "paused") return
        if (result.generation !== this.runtimeGeneration) {
          this.update({ leasePhase: "ready", leaseError: null })
          return
        }
        const queueIsCurrent = result.queueRevision === this.state.queueRevision
        const queuedMessages = queueIsCurrent
          ? (result.state.snapshot?.queuedPrompts ?? [])
          : this.state.queuedMessages
        const snapshot = result.state.snapshot
          ? { ...result.state.snapshot, queuedPrompts: queuedMessages }
          : null
        this.update({
          leasePhase: "ready",
          leaseError: null,
          status: result.state.status,
          snapshot,
          ...(queueIsCurrent ? { queuedMessages } : {}),
          ...(queueIsCurrent
            ? { queueRevision: this.state.queueRevision + 1 }
            : {}),
        })
      },
      onError: (error: unknown) => {
        this.update({
          leasePhase: "error",
          leaseError: error instanceof Error ? error.message : String(error),
        })
      },
      onReleaseError: (error: unknown) => {
        this.update({
          leaseError: error instanceof Error ? error.message : String(error),
        })
      },
    }
    this.lease = new RuntimeLeaseController(transport, callbacks, {
      renewAfterMs: 60_000,
      setTimer: this.setTimer,
      clearTimer: this.clearTimer,
    })
    this.lease.start(this.sessionId, this.leaseId)
  }
}
