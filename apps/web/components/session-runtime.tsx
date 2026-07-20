"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
  GitMergeIcon,
  LoaderCircleIcon,
  Minimize2Icon,
  RefreshCwIcon,
  SquareIcon,
  TargetIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import type {
  ExtensionUIRequest,
  ExtensionUIResponse,
  QueuedPromptItem,
  RuntimeSnapshot,
  RuntimeStatus,
  TuiSurfaceAction,
  TuiSurfaceEvent,
  TuiSurfaceSnapshot,
} from "@workspace/runtime-protocol"
import {
  extensionUIRequestSchema,
  queueStateSchema,
  queueUpdatedEventSchema,
  runtimeSnapshotSchema,
  runtimeStatusSchema,
  tuiSurfaceEventSchema,
  tuiSurfaceSnapshotsSchema,
} from "@workspace/runtime-protocol"

import { PiTuiSurface } from "@/components/pi-tui-surface"
import { PromptQueue } from "@/components/prompt-queue"
import { GoalStatusBar } from "@/components/goal-status-bar"
import { ConversationCompactionStatus } from "@/components/conversation-compaction-status"
import { ExtensionSlot } from "@/components/extension-slot"
import {
  promptImages,
  type ComposerImage,
  useComposerImages,
} from "@/components/composer-image-attachments"
import {
  ComposerModelSelect,
  ComposerThinkingSelect,
  ConversationComposer,
  nextThinkingLevel,
} from "@/components/conversation-composer"
import { SessionTreeViewer } from "@/components/session-tree-viewer"
import {
  SessionStreamingToolStatus,
  useSessionStreaming,
} from "@/components/session-streaming"
import { stripAnsi } from "@/lib/ansi"
import { notifyWhenHidden } from "@/lib/browser-notifications"
import { compactionEndOutcome } from "@/lib/compaction-events"
import type { PiGoalState } from "@/lib/pi-goal"
import type { RuntimeStreamMessage } from "@/lib/session-stream-store"
import { isVisibleTuiSurface } from "@/lib/tui-surface"

interface RuntimeEvent {
  type: string
  payload: unknown
}

type ActiveExtensionRequest = Extract<
  ExtensionUIRequest,
  { method: "select" | "confirm" | "input" | "editor" }
> & {
  requestId: string
  value: string
  expiresAt: number | null
}

function activeExtensionRequest(
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

const STATUS_LABELS: Record<RuntimeStatus, string> = {
  stopped: "未激活",
  starting: "启动中",
  ready: "就绪",
  busy: "运行中",
  stopping: "停止中",
  crashed: "已崩溃",
}

const EVENT_TYPES = [
  "runtime.starting",
  "runtime.ready",
  "runtime.busy",
  "runtime.idle",
  "runtime.stopping",
  "runtime.stopped",
  "runtime.crashed",
  "session.message.start",
  "session.message.update",
  "session.message.end",
  "session.entry.appended",
  "session.leaf.changed",
  "tool.execution.start",
  "tool.execution.update",
  "tool.execution.end",
  "queue.updated",
  "compaction.start",
  "compaction.end",
  "retry.start",
  "retry.end",
  "extension.ui.request",
  "extension.ui.closed",
  "tui.surface",
  "session.completed",
  "resync.required",
]

type PendingSurfaceEvent = Extract<
  TuiSurfaceEvent,
  { kind: "write" | "title" | "progress" }
>

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
  pendingEvents: Map<string, PendingSurfaceEvent[]>
) {
  if (event.kind === "submit") return current
  if (event.kind === "open") {
    const id = event.surface.surfaceId
    const existing = current[id]
    const base =
      existing && existing.revision >= event.surface.revision
        ? existing
        : event.surface
    const pending = pendingEvents.get(id)
    pendingEvents.delete(id)
    return {
      ...current,
      [id]: pending ? applySurfaceEvents(base, pending) : base,
    }
  }
  if (event.kind === "close") {
    pendingEvents.delete(event.surfaceId)
    if (!(event.surfaceId in current)) return current
    const next = { ...current }
    delete next[event.surfaceId]
    return next
  }

  const surface = current[event.surfaceId]
  if (!surface) {
    const pending = pendingEvents.get(event.surfaceId) ?? []
    pending.push(event)
    pendingEvents.set(event.surfaceId, pending)
    return current
  }
  return {
    ...current,
    [event.surfaceId]: applySurfaceEvents(surface, [event]),
  }
}

function messageFromPayload(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("message" in payload)
  ) {
    return null
  }
  const message = payload.message
  if (
    typeof message !== "object" ||
    message === null ||
    !("role" in message) ||
    typeof message.role !== "string" ||
    !("content" in message)
  ) {
    throw new Error("Runtime emitted an invalid Pi message event.")
  }
  const record = message as Record<string, unknown>
  for (const [key, type] of [
    ["toolCallId", "string"],
    ["toolName", "string"],
    ["isError", "boolean"],
    ["errorMessage", "string"],
    ["display", "boolean"],
  ] as const) {
    if (record[key] !== undefined && typeof record[key] !== type) {
      throw new Error(`Runtime emitted an invalid ${key}.`)
    }
  }
  return record as unknown as RuntimeStreamMessage
}

function toolExecution(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("toolCallId" in payload) ||
    typeof payload.toolCallId !== "string" ||
    !("toolName" in payload) ||
    typeof payload.toolName !== "string"
  ) {
    throw new Error("Runtime emitted an invalid tool event.")
  }
  return payload as {
    toolCallId: string
    toolName: string
  } & Record<string, unknown>
}

function retryDescription(payload: unknown) {
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
  return `重试 ${payload.attempt}/${payload.maxAttempts}`
}

export function SessionRuntime({
  sessionId,
  mutationToken,
  initialEventCursor,
  initialStatus,
  initialSnapshot,
  initialGoalState,
}: {
  sessionId: string
  mutationToken: string
  initialEventCursor: string
  initialStatus: RuntimeStatus
  initialSnapshot: RuntimeSnapshot | null
  initialGoalState: PiGoalState | null
}) {
  const router = useRouter()
  const stream = useSessionStreaming()
  const [, startTranscriptTransition] = useTransition()
  const [status, setStatus] = useState(initialStatus)
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [draft, setDraft] = useState("")
  const composerImages = useComposerImages()
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [aborting, setAborting] = useState(false)
  const abortingRef = useRef(false)
  const [streamingBehavior, setStreamingBehavior] = useState<
    "steer" | "followUp"
  >("followUp")
  const [updating, setUpdating] = useState(false)
  const updatingRef = useRef(false)
  const [queueUpdating, setQueueUpdating] = useState(false)
  const queueUpdatingRef = useRef(false)
  const [compacting, setCompacting] = useState(
    initialSnapshot?.isCompacting ?? false
  )
  const [compactionNotice, setCompactionNotice] = useState<
    "running" | "complete" | null
  >(initialSnapshot?.isCompacting ? "running" : null)
  const compactRequestRef = useRef(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [goalObjective, setGoalObjective] = useState("")
  const [goalTokenBudget, setGoalTokenBudget] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [queuedMessages, setQueuedMessages] = useState<QueuedPromptItem[]>(
    initialSnapshot?.queuedPrompts ?? []
  )
  const [retrying, setRetrying] = useState<string | null>(null)
  const [extensionRequests, setExtensionRequests] = useState<
    ActiveExtensionRequest[]
  >([])
  const extensionRequestLoadBuffers = useRef(
    new Set<ActiveExtensionRequest[]>()
  )
  const closedExtensionRequestIds = useRef(new Set<string>())
  const extensionRequestLoadGeneration = useRef(0)
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(
    null
  )
  const respondingExtensionRequestIds = useRef(new Set<string>())
  const [extensionStatuses, setExtensionStatuses] = useState<
    Record<string, string>
  >({})
  const [extensionWidgets, setExtensionWidgets] = useState<
    Record<
      string,
      { lines: string[]; placement: "aboveEditor" | "belowEditor" }
    >
  >({})
  const [tuiSurfaces, setTuiSurfaces] = useState<
    Record<string, TuiSurfaceSnapshot>
  >({})
  const pendingSurfaceEvents = useRef(new Map<string, PendingSurfaceEvent[]>())
  const surfaceLoadBuffers = useRef(new Set<TuiSurfaceEvent[]>())
  const surfaceLoadGeneration = useRef(0)
  const surfaceLoadSequence = useRef(0)
  const closingTuiSurfaceIds = useRef(new Set<string>())
  const extensionRequestLoadSequence = useRef(0)
  const runtimeStateLoadSequence = useRef(0)
  const runtimeStateGeneration = useRef(0)
  const wasBusy = useRef(false)
  const agentRunActive = useRef(initialStatus === "busy")
  const streamRevision = useRef(0)
  const completedStreamRevision = useRef<number | null>(null)
  const committedEventCursor = useRef(initialEventCursor)
  const selectedModel = snapshot?.model
  const extensionRequest = extensionRequests[0] ?? null
  const extensionValue = extensionRequest?.value ?? ""
  const imagesSupported = selectedModel
    ? snapshot.availableModels.some(
        (model) =>
          model.provider === selectedModel.provider &&
          model.id === selectedModel.id &&
          model.input.includes("image")
      )
    : false

  const updateRuntimeStatus = useCallback(
    (nextStatus: RuntimeStatus) => {
      setStatus(nextStatus)
      stream.setRuntimeStatus(nextStatus)
    },
    [stream]
  )

  useLayoutEffect(() => {
    stream.setRuntimeStatus(status)
  }, [status, stream])

  useLayoutEffect(() => {
    if (committedEventCursor.current === initialEventCursor) return
    committedEventCursor.current = initialEventCursor
    const completed = completedStreamRevision.current
    if (completed === null) return
    completedStreamRevision.current = null
    if (streamRevision.current === completed) stream.clear(true)
  }, [initialEventCursor, stream])

  async function mutate<T>(
    path: string,
    method: "POST" | "PUT",
    body?: unknown
  ) {
    const response = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        "X-Pi-Web-Codex-Mutation-Token": mutationToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const result = text ? (JSON.parse(text) as unknown) : null
    if (!response.ok) {
      const message =
        typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : `Pi runtime 操作失败（HTTP ${response.status}）。`
      throw new Error(message)
    }
    if (result === null) throw new Error("Pi runtime 返回了空响应。")
    return result as T
  }

  async function sendMessage(
    rawMessage: string,
    options: { images?: ComposerImage[]; clearDraft?: boolean } = {}
  ) {
    const text = rawMessage.trim()
    const images = options.images ?? []
    if (
      (!text && images.length === 0) ||
      submittingRef.current ||
      abortingRef.current
    ) {
      return false
    }

    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    stream.requestFollow()
    try {
      await mutate(`/api/v1/sessions/${sessionId}/messages`, "POST", {
        message: text || "请查看附加图片。",
        images: promptImages(images),
        streamingBehavior,
      })
      if (options.clearDraft) {
        setDraft((current) => (current.trim() === text ? "" : current))
        composerImages.clearImages()
      }
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return false
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const sendTuiMessage = useEffectEvent((message: string) => {
    void sendMessage(message)
  })

  const clearExtensionUi = useEffectEvent(() => {
    extensionRequestLoadGeneration.current += 1
    closedExtensionRequestIds.current.clear()
    setExtensionRequests([])
    setRespondingRequestId(null)
    respondingExtensionRequestIds.current.clear()
    setExtensionStatuses({})
    setExtensionWidgets({})
    document.title = "pi-web-codex"
  })

  const loadTuiSurfaces = useEffectEvent(async () => {
    const generation = surfaceLoadGeneration.current
    const sequence = ++surfaceLoadSequence.current
    const bufferedEvents: TuiSurfaceEvent[] = []
    const pendingBeforeLoad = new Map(
      [...pendingSurfaceEvents.current].map(([surfaceId, events]) => [
        surfaceId,
        [...events],
      ])
    )
    surfaceLoadBuffers.current.add(bufferedEvents)
    try {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/tui-surfaces`,
        { cache: "no-store" }
      )
      if (!response.ok) {
        throw new Error(`TUI surfaces 同步失败（HTTP ${response.status}）。`)
      }
      const snapshots = tuiSurfaceSnapshotsSchema.parse(await response.json())
      if (
        generation !== surfaceLoadGeneration.current ||
        sequence !== surfaceLoadSequence.current
      ) {
        return
      }

      let next: Record<string, TuiSurfaceSnapshot> = {}
      const pending = pendingBeforeLoad
      for (const snapshot of snapshots) {
        const queued = pending.get(snapshot.surfaceId)
        next[snapshot.surfaceId] = queued
          ? applySurfaceEvents(snapshot, queued)
          : snapshot
        pending.delete(snapshot.surfaceId)
      }
      for (const event of bufferedEvents) {
        next = applyTuiSurfaceEvent(next, event, pending)
      }
      pendingSurfaceEvents.current = pending
      setTuiSurfaces(next)
    } finally {
      surfaceLoadBuffers.current.delete(bufferedEvents)
    }
  })

  const loadExtensionRequests = useEffectEvent(async () => {
    const generation = extensionRequestLoadGeneration.current
    const sequence = ++extensionRequestLoadSequence.current
    const bufferedRequests: ActiveExtensionRequest[] = []
    extensionRequestLoadBuffers.current.add(bufferedRequests)
    try {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/extension-ui-requests`,
        { cache: "no-store" }
      )
      if (!response.ok) {
        throw new Error(`Extension UI 同步失败（HTTP ${response.status}）。`)
      }
      const body = (await response.json()) as unknown
      if (!Array.isArray(body)) {
        throw new Error("Extension UI 同步返回了无效响应。")
      }
      const now = Date.now()
      const loaded = body.map((item) => {
        if (
          typeof item !== "object" ||
          item === null ||
          !("requestId" in item) ||
          typeof item.requestId !== "string" ||
          !("request" in item) ||
          !("expiresAt" in item) ||
          (item.expiresAt !== null && typeof item.expiresAt !== "number")
        ) {
          throw new Error("Extension UI 同步返回了无效请求。")
        }
        return activeExtensionRequest(
          item.requestId,
          extensionUIRequestSchema.parse(item.request),
          item.expiresAt
        )
      })
      if (
        generation !== extensionRequestLoadGeneration.current ||
        sequence !== extensionRequestLoadSequence.current
      ) {
        return
      }

      const byId = new Map<string, ActiveExtensionRequest>()
      for (const request of [...loaded, ...bufferedRequests]) {
        if (
          closedExtensionRequestIds.current.has(request.requestId) ||
          (request.expiresAt !== null && request.expiresAt <= now)
        ) {
          continue
        }
        byId.set(request.requestId, request)
      }
      closedExtensionRequestIds.current.clear()
      setExtensionRequests((current) =>
        [...byId.values()].map((request) => {
          const existing = current.find(
            (candidate) => candidate.requestId === request.requestId
          )
          return existing ? { ...request, value: existing.value } : request
        })
      )
    } finally {
      extensionRequestLoadBuffers.current.delete(bufferedRequests)
    }
  })

  const loadRuntimeState = useEffectEvent(async () => {
    for (;;) {
      const generation = runtimeStateGeneration.current
      const sequence = ++runtimeStateLoadSequence.current
      const response = await fetch(`/api/v1/sessions/${sessionId}/runtime`, {
        cache: "no-store",
      })
      const body = (await response.json()) as {
        status?: unknown
        snapshot?: unknown
        error?: string
      }
      if (!response.ok) {
        throw new Error(
          body.error ?? `Runtime 状态同步失败（HTTP ${response.status}）。`
        )
      }
      const nextStatus = runtimeStatusSchema.parse(body.status)
      const nextSnapshot =
        body.snapshot === null
          ? null
          : runtimeSnapshotSchema.parse(body.snapshot)
      if (sequence !== runtimeStateLoadSequence.current) return
      if (generation !== runtimeStateGeneration.current) continue

      updateRuntimeStatus(nextStatus)
      setSnapshot(nextSnapshot)
      setQueuedMessages(nextSnapshot?.queuedPrompts ?? [])
      setCompacting(nextSnapshot?.isCompacting ?? false)
      setCompactionNotice(nextSnapshot?.isCompacting ? "running" : null)
      agentRunActive.current = nextStatus === "busy"
      wasBusy.current = nextStatus === "busy"
      return
    }
  })

  async function actOnTuiSurface(surfaceId: string, action: TuiSurfaceAction) {
    await mutate(`/api/v1/tui-surfaces/${surfaceId}`, "POST", {
      sessionId,
      action,
    })
  }

  useEffect(() => {
    const search = new URLSearchParams({
      sessionId,
      after: initialEventCursor,
    })
    const events = new EventSource(`/api/v1/events?${search}`)
    void Promise.all([loadTuiSurfaces(), loadExtensionRequests()]).catch(
      (failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure))
    )
    const handoffTranscript = () => {
      completedStreamRevision.current = streamRevision.current
      startTranscriptTransition(() => router.refresh())
    }
    const handle = (source: Event) => {
      const event = JSON.parse(
        (source as MessageEvent<string>).data
      ) as RuntimeEvent
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
        runtimeStateGeneration.current += 1
      }
      if (event.type === "runtime.starting") {
        streamRevision.current += 1
        agentRunActive.current = false
        completedStreamRevision.current = null
        stream.clear(true)
        updateRuntimeStatus("starting")
        setTuiSurfaces({})
        pendingSurfaceEvents.current.clear()
        closingTuiSurfaceIds.current.clear()
        surfaceLoadGeneration.current += 1
        setCompacting(false)
        setCompactionNotice(null)
        setRetrying(null)
        clearExtensionUi()
      }
      if (event.type === "runtime.ready") {
        const nextSnapshot = runtimeSnapshotSchema.parse(event.payload)
        updateRuntimeStatus("ready")
        setSnapshot(nextSnapshot)
        setQueuedMessages(nextSnapshot.queuedPrompts)
        setCompacting(nextSnapshot.isCompacting)
        setCompactionNotice(nextSnapshot.isCompacting ? "running" : null)
        setError(null)
        void Promise.all([loadTuiSurfaces(), loadExtensionRequests()]).catch(
          (failure: unknown) =>
            setError(
              failure instanceof Error ? failure.message : String(failure)
            )
        )
      }
      if (event.type === "runtime.busy") {
        if (!agentRunActive.current) {
          agentRunActive.current = true
          streamRevision.current += 1
          completedStreamRevision.current = null
        }
        wasBusy.current = true
        updateRuntimeStatus("busy")
      }
      if (event.type === "runtime.idle") {
        updateRuntimeStatus("ready")
        if (wasBusy.current) {
          notifyWhenHidden("Pi 已完成", "当前 Agent 轮次已结束。")
          wasBusy.current = false
        }
      }
      if (event.type === "runtime.stopping") updateRuntimeStatus("stopping")
      if (event.type === "runtime.stopped") {
        if (agentRunActive.current) {
          agentRunActive.current = false
          handoffTranscript()
        } else if (completedStreamRevision.current === null) {
          stream.clear(true)
        }
        updateRuntimeStatus("stopped")
        setSnapshot(null)
        setQueuedMessages([])
        setTuiSurfaces({})
        pendingSurfaceEvents.current.clear()
        closingTuiSurfaceIds.current.clear()
        surfaceLoadGeneration.current += 1
        setCompacting(false)
        setCompactionNotice(null)
        setRetrying(null)
        clearExtensionUi()
      }
      if (event.type === "runtime.crashed") {
        if (agentRunActive.current) {
          agentRunActive.current = false
          handoffTranscript()
        } else if (completedStreamRevision.current === null) {
          stream.clear(true)
        }
        wasBusy.current = false
        updateRuntimeStatus("crashed")
        setQueuedMessages([])
        setTuiSurfaces({})
        pendingSurfaceEvents.current.clear()
        closingTuiSurfaceIds.current.clear()
        surfaceLoadGeneration.current += 1
        setCompacting(false)
        setCompactionNotice(null)
        setRetrying(null)
        clearExtensionUi()
        setError("Pi worker 意外退出；历史 JSONL 仍可读取。")
        notifyWhenHidden(
          "Pi Runtime 已崩溃",
          "历史内容仍可读取，可回到 session 显式重启。"
        )
      }
      if (event.type === "session.message.start") {
        const message = messageFromPayload(event.payload)
        if (!message) throw new Error("Runtime omitted a started message.")
        if (!agentRunActive.current) {
          agentRunActive.current = true
          streamRevision.current += 1
          completedStreamRevision.current = null
        }
        stream.startMessage(message)
      }
      if (event.type === "session.message.update") {
        const message = messageFromPayload(event.payload)
        if (!message) throw new Error("Runtime omitted an updated message.")
        stream.updateMessage(message)
      }
      if (event.type === "session.message.end") {
        const message = messageFromPayload(event.payload)
        if (!message) throw new Error("Runtime omitted a completed message.")
        stream.endMessage(message)
      }
      if (
        event.type === "session.entry.appended" &&
        !agentRunActive.current &&
        completedStreamRevision.current === null
      ) {
        router.refresh()
      }
      if (event.type === "session.completed") {
        agentRunActive.current = false
        updateRuntimeStatus("ready")
        setRetrying(null)
        handoffTranscript()
      }
      if (event.type === "session.leaf.changed") {
        if (
          typeof event.payload !== "object" ||
          event.payload === null ||
          !("leafId" in event.payload) ||
          (event.payload.leafId !== null &&
            typeof event.payload.leafId !== "string") ||
          ("editorText" in event.payload &&
            event.payload.editorText !== undefined &&
            typeof event.payload.editorText !== "string")
        ) {
          throw new Error("Runtime emitted an invalid session leaf event.")
        }
        if (
          "editorText" in event.payload &&
          typeof event.payload.editorText === "string"
        ) {
          setDraft(event.payload.editorText)
        }
        agentRunActive.current = false
        completedStreamRevision.current = null
        stream.clear(true)
        router.refresh()
      }
      if (event.type === "tool.execution.start") {
        const tool = toolExecution(event.payload)
        if (!("args" in tool)) {
          throw new Error("Runtime omitted started tool arguments.")
        }
        stream.startTool({
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          args: tool.args,
        })
      }
      if (event.type === "tool.execution.update") {
        const tool = toolExecution(event.payload)
        if (!("args" in tool) || !("partialResult" in tool)) {
          throw new Error("Runtime omitted a partial tool result.")
        }
        stream.updateTool({
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          args: tool.args,
          partialResult: tool.partialResult,
        })
      }
      if (event.type === "tool.execution.end") {
        const tool = toolExecution(event.payload)
        if (
          !("result" in tool) ||
          !("isError" in tool) ||
          typeof tool.isError !== "boolean"
        ) {
          throw new Error("Runtime omitted a completed tool result.")
        }
        stream.endTool({
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          result: tool.result,
          isError: tool.isError,
        })
      }
      if (event.type === "queue.updated") {
        setQueuedMessages(queueUpdatedEventSchema.parse(event.payload).items)
      }
      if (event.type === "compaction.start") {
        setCompacting(true)
        setCompactionNotice("running")
        updateRuntimeStatus("busy")
      }
      if (event.type === "compaction.end") {
        const outcome = compactionEndOutcome(event.payload)
        setCompacting(false)
        if (outcome.kind === "complete") {
          setCompactionNotice("complete")
          router.refresh()
        } else {
          setCompactionNotice(null)
          if (outcome.kind === "failed") setError(outcome.message)
        }
      }
      if (event.type === "retry.start") {
        setRetrying(retryDescription(event.payload))
      }
      if (event.type === "retry.end") setRetrying(null)
      if (event.type === "tui.surface") {
        const tuiEvent = tuiSurfaceEventSchema.parse(event.payload)
        for (const buffer of surfaceLoadBuffers.current) {
          buffer.push(tuiEvent)
        }
        if (tuiEvent.kind === "submit") {
          sendTuiMessage(tuiEvent.value)
        } else {
          setTuiSurfaces((current) =>
            applyTuiSurfaceEvent(
              current,
              tuiEvent,
              pendingSurfaceEvents.current
            )
          )
          if (tuiEvent.kind === "close" && tuiEvent.value !== undefined) {
            setDraft(tuiEvent.value)
          }
          if (tuiEvent.kind === "close") {
            closingTuiSurfaceIds.current.delete(tuiEvent.surfaceId)
          }
        }
      }
      if (event.type === "extension.ui.request") {
        if (
          typeof event.payload !== "object" ||
          event.payload === null ||
          !("requestId" in event.payload) ||
          typeof event.payload.requestId !== "string"
        ) {
          throw new Error("Runtime emitted an invalid extension UI request.")
        }
        const request = extensionUIRequestSchema.parse(event.payload)
        if (request.method === "notify") {
          const notify = request.notifyType ?? "info"
          toast[notify](request.message)
          notifyWhenHidden("Pi extension", request.message)
        } else if (request.method === "setStatus") {
          setExtensionStatuses((current) => {
            const next = { ...current }
            if (request.statusText !== undefined) {
              next[request.statusKey] = request.statusText
            } else delete next[request.statusKey]
            return next
          })
        } else if (request.method === "setWidget") {
          setExtensionWidgets((current) => {
            const next = { ...current }
            if (request.widgetLines) {
              next[request.widgetKey] = {
                lines: request.widgetLines,
                placement: request.widgetPlacement ?? "aboveEditor",
              }
            } else {
              delete next[request.widgetKey]
            }
            return next
          })
        } else if (request.method === "set_editor_text") {
          setDraft(request.text)
        } else if (request.method === "set_title") {
          document.title = request.title
        } else {
          const requestId = event.payload.requestId
          if (
            !("expiresAt" in event.payload) ||
            (event.payload.expiresAt !== null &&
              typeof event.payload.expiresAt !== "number")
          ) {
            throw new Error("Runtime omitted an extension UI expiry.")
          }
          const activeRequest = activeExtensionRequest(
            requestId,
            request,
            event.payload.expiresAt
          )
          closedExtensionRequestIds.current.delete(requestId)
          for (const buffer of extensionRequestLoadBuffers.current) {
            buffer.push(activeRequest)
          }
          setExtensionRequests((current) => {
            const existing = current.find(
              (item) => item.requestId === requestId
            )
            return existing
              ? current.map((item) =>
                  item.requestId === requestId
                    ? { ...activeRequest, value: item.value }
                    : item
                )
              : [...current, activeRequest]
          })
        }
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
        closedExtensionRequestIds.current.add(requestId)
        setExtensionRequests((current) =>
          current.filter((request) => request.requestId !== requestId)
        )
      }
      if (event.type === "resync.required") {
        completedStreamRevision.current = null
        stream.clear(true)
        router.refresh()
        void Promise.all([
          loadRuntimeState(),
          loadTuiSurfaces(),
          loadExtensionRequests(),
        ]).catch((failure: unknown) =>
          setError(failure instanceof Error ? failure.message : String(failure))
        )
      }
    }

    for (const type of EVENT_TYPES) events.addEventListener(type, handle)
    events.onerror = () => {
      setConnectionError("实时连接已断开；浏览器正在自动重连。")
    }
    events.onopen = () => setConnectionError(null)
    return () => events.close()
  }, [initialEventCursor, router, sessionId, stream, updateRuntimeStatus])

  const cancelPendingExtensionRequests = useEffectEvent(() => {
    for (const request of extensionRequests) {
      if (respondingExtensionRequestIds.current.has(request.requestId)) continue
      void fetch(`/api/v1/extension-ui/${request.requestId}/respond`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify({
          sessionId,
          response: { cancelled: true },
        }),
      }).then(
        (response) => {
          if (!response.ok) {
            console.error(
              `Extension UI cleanup failed (HTTP ${response.status}).`
            )
          }
        },
        (failure: unknown) =>
          console.error("Extension UI cleanup failed.", failure)
      )
    }
  })

  useEffect(() => {
    if (!extensionRequest?.expiresAt) return
    const requestId = extensionRequest.requestId
    const timeout = Math.max(0, extensionRequest.expiresAt - Date.now())
    const timer = window.setTimeout(() => {
      closedExtensionRequestIds.current.add(requestId)
      setExtensionRequests((current) =>
        current.filter((request) => request.requestId !== requestId)
      )
    }, timeout)
    return () => window.clearTimeout(timer)
  }, [extensionRequest])

  useEffect(
    () => () => {
      cancelPendingExtensionRequests()
      document.title = "pi-web-codex"
    },
    []
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendMessage(draft, {
      images: composerImages.images,
      clearDraft: true,
    })
  }

  async function abort() {
    if (abortingRef.current) return
    abortingRef.current = true
    setAborting(true)
    setError(null)
    try {
      await mutate(`/api/v1/sessions/${sessionId}/abort`, "POST")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      abortingRef.current = false
      setAborting(false)
    }
  }

  async function restartRuntime() {
    if (updatingRef.current) return
    updatingRef.current = true
    setUpdating(true)
    setError(null)
    try {
      const state = await mutate<{
        status: RuntimeStatus
        snapshot: RuntimeSnapshot | null
      }>(`/api/v1/sessions/${sessionId}/activate`, "POST")
      updateRuntimeStatus(state.status)
      setSnapshot(state.snapshot)
      setQueuedMessages(state.snapshot?.queuedPrompts ?? [])
      setCompacting(state.snapshot?.isCompacting ?? false)
      setCompactionNotice(state.snapshot?.isCompacting ? "running" : null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      updatingRef.current = false
      setUpdating(false)
    }
  }

  async function setModel(model: RuntimeSnapshot["availableModels"][number]) {
    if (updatingRef.current) return
    updatingRef.current = true
    setUpdating(true)
    setError(null)
    try {
      setSnapshot(
        await mutate<RuntimeSnapshot>(
          `/api/v1/sessions/${sessionId}/model`,
          "PUT",
          { provider: model.provider, modelId: model.id }
        )
      )
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      updatingRef.current = false
      setUpdating(false)
    }
  }

  async function setThinkingLevel(level: RuntimeSnapshot["thinkingLevel"]) {
    if (updatingRef.current) return
    updatingRef.current = true
    setUpdating(true)
    setError(null)
    try {
      setSnapshot(
        await mutate<RuntimeSnapshot>(
          `/api/v1/sessions/${sessionId}/thinking-level`,
          "PUT",
          { level }
        )
      )
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      updatingRef.current = false
      setUpdating(false)
    }
  }

  async function replaceQueuedMessages(next: QueuedPromptItem[]) {
    if (queueUpdatingRef.current || abortingRef.current) return
    queueUpdatingRef.current = true
    setQueueUpdating(true)
    setError(null)
    try {
      const state = queueStateSchema.parse(
        await mutate(`/api/v1/sessions/${sessionId}/queue`, "PUT", {
          expected: queuedMessages,
          next,
        })
      )
      setQueuedMessages(state.items)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      throw failure
    } finally {
      queueUpdatingRef.current = false
      setQueueUpdating(false)
    }
  }

  function selectStreamingBehavior(value: string) {
    if (value !== "steer" && value !== "followUp") {
      throw new Error("Pi returned an invalid queue behavior.")
    }
    setStreamingBehavior(value)
  }

  async function compact() {
    if (compacting || compactRequestRef.current) return
    compactRequestRef.current = true
    setCompacting(true)
    setCompactionNotice("running")
    setError(null)
    try {
      const result = await mutate<{ snapshot: RuntimeSnapshot }>(
        `/api/v1/sessions/${sessionId}/compact`,
        "POST",
        {}
      )
      setSnapshot(result.snapshot)
      setCompactionNotice("complete")
      router.refresh()
    } catch (failure) {
      setCompactionNotice(null)
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      compactRequestRef.current = false
      setCompacting(false)
    }
  }

  async function startGoal() {
    const objective = goalObjective.trim()
    if (!objective) return
    const tokenBudget = goalTokenBudget ? Number(goalTokenBudget) : null
    if (
      tokenBudget !== null &&
      (!Number.isSafeInteger(tokenBudget) || tokenBudget <= 0)
    ) {
      return
    }
    const budget = tokenBudget === null ? "" : `--tokens ${tokenBudget} `
    if (await sendMessage(`/goal ${budget}${objective}`)) {
      setGoalDialogOpen(false)
      setGoalObjective("")
      setGoalTokenBudget("")
    }
  }

  async function respondToExtensionUI(response: ExtensionUIResponse) {
    if (!extensionRequest) return
    const requestId = extensionRequest.requestId
    if (respondingExtensionRequestIds.current.has(requestId)) return
    respondingExtensionRequestIds.current.add(requestId)
    setRespondingRequestId(requestId)
    setError(null)
    try {
      const result = await fetch(`/api/v1/extension-ui/${requestId}/respond`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify({ sessionId, response }),
      })
      if (!result.ok) {
        const body = (await result.json()) as { error?: string }
        throw new Error(body.error ?? "Extension UI 响应失败。")
      }
      closedExtensionRequestIds.current.add(requestId)
      setExtensionRequests((current) =>
        current.filter((request) => request.requestId !== requestId)
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      respondingExtensionRequestIds.current.delete(requestId)
      setRespondingRequestId((current) =>
        current === requestId ? null : current
      )
    }
  }

  async function closeTuiSurface(surfaceId: string) {
    if (closingTuiSurfaceIds.current.has(surfaceId)) return
    closingTuiSurfaceIds.current.add(surfaceId)
    try {
      await actOnTuiSurface(surfaceId, { version: 1, action: "close" })
    } catch (failure) {
      closingTuiSurfaceIds.current.delete(surfaceId)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  function updateExtensionValue(value: string) {
    setExtensionRequests((current) =>
      current.map((request, index) =>
        index === 0 ? { ...request, value } : request
      )
    )
  }

  const isBusy = status === "busy"
  const settingsDisabled = status !== "ready" || updating || compacting
  const goalTokenBudgetValid =
    !goalTokenBudget ||
    (Number.isSafeInteger(Number(goalTokenBudget)) &&
      Number(goalTokenBudget) > 0)
  const goalAvailable = Boolean(
    snapshot?.activeTools.includes("goal_complete") &&
    snapshot.activeTools.includes("goal_blocked")
  )
  const widgets = Object.entries(extensionWidgets)
  const surfaces = Object.values(tuiSurfaces)
  const editorSurface = surfaces.find((surface) => surface.mode === "editor")
  const modalSurface = surfaces
    .filter(
      (surface) => surface.mode === "dialog" || surface.mode === "overlay"
    )
    .at(-1)
  const inlineSurfaces = (placement: TuiSurfaceSnapshot["placement"]) =>
    surfaces.filter(
      (surface) =>
        surface.mode === "inline" &&
        surface.placement === placement &&
        isVisibleTuiSurface(surface)
    )

  const renderTuiSurface = (surface: TuiSurfaceSnapshot) => (
    <section
      key={surface.surfaceId}
      className="grid gap-2 rounded-xl border bg-background p-2"
    >
      {surface.title || surface.progress ? (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          {surface.progress ? (
            <LoaderCircleIcon className="size-3 animate-spin" />
          ) : null}
          {surface.title ? <span>{surface.title}</span> : null}
        </div>
      ) : null}
      <PiTuiSurface
        surface={surface}
        onAction={(action) => actOnTuiSurface(surface.surfaceId, action)}
        onError={(failure) => setError(failure.message)}
      />
    </section>
  )

  return (
    <div className="z-10 shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
      <div className="mx-auto grid w-full max-w-[52rem] min-w-0 gap-3">
        {inlineSurfaces("header").map(renderTuiSurface)}
        {compactionNotice ? (
          <ConversationCompactionStatus state={compactionNotice} />
        ) : null}
        {inlineSurfaces("aboveEditor").map(renderTuiSurface)}
        {widgets
          .filter(([, widget]) => widget.placement === "aboveEditor")
          .map(([key, widget]) => (
            <pre
              key={key}
              className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap"
            >
              {widget.lines.join("\n")}
            </pre>
          ))}
        <GoalStatusBar
          initialState={initialGoalState}
          disabled={status === "starting" || status === "crashed"}
          onCommand={(args) => sendMessage(`/goal ${args}`)}
        />
        <ExtensionSlot name="composer.above" excludeViewIds={["goal.card"]} />
        <PromptQueue
          items={queuedMessages}
          onReplace={replaceQueuedMessages}
          disabled={submitting || aborting || queueUpdating}
        />
        <ConversationComposer
          value={draft}
          onValueChange={setDraft}
          onSubmit={submit}
          submitting={submitting}
          sendDisabled={
            status === "crashed" ||
            aborting ||
            queueUpdating ||
            composerImages.loading
          }
          images={composerImages.images}
          imageError={composerImages.error}
          imagesSupported={imagesSupported}
          onImagesAdd={composerImages.addImages}
          onImageRemove={composerImages.removeImage}
          onCycleThinkingLevel={
            snapshot &&
            snapshot.availableThinkingLevels.length > 1 &&
            !settingsDisabled
              ? () =>
                  void setThinkingLevel(
                    nextThinkingLevel(
                      snapshot.thinkingLevel,
                      snapshot.availableThinkingLevels
                    )
                  )
              : undefined
          }
          commands={[
            ...(goalAvailable
              ? [
                  {
                    id: "goal",
                    label: "目标",
                    description: "让 Pi 持续工作直到目标完成",
                    icon: TargetIcon,
                    disabled: settingsDisabled,
                    onSelect: () => setGoalDialogOpen(true),
                  },
                ]
              : []),
            {
              id: "compact",
              label: "压缩",
              description: "主动压缩",
              icon: Minimize2Icon,
              disabled: settingsDisabled,
              onSelect: () => void compact(),
            },
            {
              id: "tree",
              label: "会话树",
              description: "查看并切换会话分支",
              icon: GitMergeIcon,
              disabled: ["starting", "busy", "stopping", "crashed"].includes(
                status
              ),
              onSelect: () => setTreeOpen(true),
            },
          ]}
          editor={
            editorSurface ? (
              <PiTuiSurface
                surface={editorSurface}
                onAction={(action) =>
                  actOnTuiSurface(editorSurface.surfaceId, action)
                }
                onError={(failure) => setError(failure.message)}
              />
            ) : undefined
          }
          actions={
            <>
              {goalAvailable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGoalDialogOpen(true)}
                  disabled={settingsDisabled}
                >
                  <TargetIcon />
                  目标
                </Button>
              ) : null}
              <Badge
                variant={status === "crashed" ? "destructive" : "secondary"}
              >
                {STATUS_LABELS[status]}
              </Badge>
              <SessionStreamingToolStatus />
              {composerImages.loading ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  正在读取图片…
                </span>
              ) : null}
              {retrying ? (
                <span className="text-xs text-muted-foreground">
                  {retrying}
                </span>
              ) : null}
              {Object.entries(extensionStatuses).map(([key, text]) => (
                <span key={key} className="text-xs text-muted-foreground">
                  {stripAnsi(text)}
                </span>
              ))}
              <ExtensionSlot name="composer.actions" />
            </>
          }
          endActions={
            <>
              {isBusy ? (
                <Select
                  value={streamingBehavior}
                  onValueChange={selectStreamingBehavior}
                  disabled={aborting}
                >
                  <SelectTrigger size="sm" aria-label="消息队列方式">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="top">
                    <SelectItem value="followUp">完成后继续</SelectItem>
                    <SelectItem value="steer">当前轮次补充</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {isBusy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={abort}
                  aria-label="终止"
                  disabled={aborting}
                >
                  {aborting ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <SquareIcon />
                  )}
                </Button>
              ) : null}
            </>
          }
          settings={
            snapshot ? (
              <>
                {snapshot.model && snapshot.availableModels.length ? (
                  <ComposerModelSelect
                    model={snapshot.model}
                    models={snapshot.availableModels}
                    onModelChange={(model) => void setModel(model)}
                    disabled={settingsDisabled}
                    settingsHref={`/settings/models?sessionId=${encodeURIComponent(sessionId)}`}
                  />
                ) : null}
                <ComposerThinkingSelect
                  level={snapshot.thinkingLevel}
                  levels={snapshot.availableThinkingLevels}
                  onLevelChange={(level) => void setThinkingLevel(level)}
                  disabled={settingsDisabled}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={compact}
                  disabled={settingsDisabled}
                >
                  {compacting ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <Minimize2Icon />
                  )}
                  压缩上下文
                </Button>
              </>
            ) : null
          }
        />
        <SessionTreeViewer
          sessionId={sessionId}
          mutationToken={mutationToken}
          open={treeOpen}
          onOpenChange={setTreeOpen}
        />
        <ExtensionSlot name="composer.below" />
        {widgets
          .filter(([, widget]) => widget.placement === "belowEditor")
          .map(([key, widget]) => (
            <pre
              key={key}
              className="overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs whitespace-pre-wrap"
            >
              {widget.lines.join("\n")}
            </pre>
          ))}
        {inlineSurfaces("belowEditor").map(renderTuiSurface)}
        {inlineSurfaces("footer").map(renderTuiSurface)}
        {status === "crashed" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">
              {error ?? "Pi worker 意外退出；历史 JSONL 仍可读取。"}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void restartRuntime()}
              disabled={updating}
            >
              <RefreshCwIcon
                className={updating ? "animate-spin" : undefined}
              />
              重新启动 Runtime
            </Button>
          </div>
        ) : error || connectionError ? (
          <p className="text-sm text-destructive">{error ?? connectionError}</p>
        ) : null}
      </div>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>启动目标</DialogTitle>
            <DialogDescription>
              Pi 会持续推进并验证结果，直到完成、暂停或遇到真正的阻塞。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Textarea
              value={goalObjective}
              onChange={(event) => setGoalObjective(event.target.value)}
              placeholder="描述需要完成的目标"
              aria-label="目标内容"
              maxLength={4_000}
              className="min-h-28"
              autoFocus
            />
            <Input
              type="number"
              min={1}
              step={1}
              value={goalTokenBudget}
              onChange={(event) => setGoalTokenBudget(event.target.value)}
              placeholder="Token 预算（可选）"
              aria-label="Token 预算"
              aria-invalid={!goalTokenBudgetValid}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void startGoal()}
              disabled={
                !goalObjective.trim() || !goalTokenBudgetValid || submitting
              }
            >
              启动目标
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={extensionRequest !== null}
        onOpenChange={(open) => {
          if (!open && extensionRequest) {
            void respondToExtensionUI({ cancelled: true })
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          {extensionRequest ? (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>{extensionRequest.title}</DialogTitle>
                {extensionRequest.method === "confirm" ? (
                  <DialogDescription>
                    {extensionRequest.message}
                  </DialogDescription>
                ) : null}
              </DialogHeader>

              {extensionRequest.method === "select" ? (
                <Select
                  value={extensionValue}
                  onValueChange={updateExtensionValue}
                  disabled={respondingRequestId !== null}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={extensionRequest.title}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {extensionRequest.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {extensionRequest.method === "input" ? (
                <Input
                  value={extensionValue}
                  onChange={(event) => updateExtensionValue(event.target.value)}
                  placeholder={extensionRequest.placeholder}
                  autoFocus
                  disabled={respondingRequestId !== null}
                />
              ) : null}

              {extensionRequest.method === "editor" ? (
                <Textarea
                  value={extensionValue}
                  onChange={(event) => updateExtensionValue(event.target.value)}
                  className="min-h-56"
                  autoFocus
                  disabled={respondingRequestId !== null}
                />
              ) : null}

              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={respondingRequestId !== null}
                  onClick={() =>
                    void respondToExtensionUI(
                      extensionRequest.method === "confirm"
                        ? { confirmed: false }
                        : { cancelled: true }
                    )
                  }
                >
                  取消
                </Button>
                <Button
                  onClick={() =>
                    void respondToExtensionUI(
                      extensionRequest.method === "confirm"
                        ? { confirmed: true }
                        : { value: extensionValue }
                    )
                  }
                  disabled={
                    respondingRequestId !== null ||
                    (extensionRequest.method === "select" && !extensionValue)
                  }
                >
                  确定
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={modalSurface !== undefined}
        onOpenChange={(open) => {
          if (!open && modalSurface) {
            void closeTuiSurface(modalSurface.surfaceId)
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          {modalSurface ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {modalSurface.title ?? "Pi extension"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Interactive Pi terminal surface.
                </DialogDescription>
              </DialogHeader>
              <PiTuiSurface
                surface={modalSurface}
                onAction={(action) =>
                  actOnTuiSurface(modalSurface.surfaceId, action)
                }
                onError={(failure) => setError(failure.message)}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
