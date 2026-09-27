"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react"
import {
  FileTextIcon,
  GitMergeIcon,
  LoaderCircleIcon,
  Minimize2Icon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  TargetIcon,
  TerminalIcon,
} from "lucide-react"
import { toast } from "sonner"

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
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import type {
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
  runtimeSnapshotSchema,
  runtimeStatusSchema,
  tuiSurfaceEventSchema,
  tuiSurfaceSnapshotsSchema,
} from "@workspace/runtime-protocol"

import dynamic from "next/dynamic"

const PiTuiSurface = dynamic(
  () =>
    import("@/components/pi-tui-surface").then((module) => module.PiTuiSurface),
  { ssr: false }
)
import { useI18n } from "@/components/i18n-provider"
import { PromptQueue } from "@/components/prompt-queue"
import { GoalStatusBar } from "@/components/goal-status-bar"
import { ConversationCompactionStatus } from "@/components/conversation-compaction-status"
import { composerCommandDescription } from "@/lib/composer-command-text"
import { ExtensionSlot } from "@/components/extension-slot"
import {
  promptImages,
  type ComposerImage,
  useComposerImages,
} from "@/components/composer-image-attachments"
import {
  adjacentThinkingLevel,
  ComposerModelSelect,
  ComposerThinkingSelect,
  ConversationComposer,
  nextThinkingLevel,
} from "@/components/conversation-composer"
import { SessionTreeViewer } from "@/components/session-tree-viewer"
import { useSessionComposerDraftStore } from "@/components/session-composer-draft-context"
import {
  SessionStreamingToolStatus,
  useSessionEvents,
  useSessionStreaming,
} from "@/components/session-streaming"
import { useSessionViewController } from "@/components/session-streaming-context"
import { stripAnsi } from "@/lib/ansi"
import { ApiError, responseJson } from "@/lib/api-response"
import { notifyWhenHidden } from "@/lib/browser-notifications"
import { compactionEndOutcome } from "@/lib/compaction-events"
import type { PiGoalState } from "@/lib/pi-goal"
import { reconcilePromptQueueMutation } from "@/lib/prompt-queue-sync"
import { parseSessionLiveEvent } from "@/lib/session-live-events"
import { useStreamingRuntimeStatus } from "@/components/session-streaming-context"
import { draftAfterAcceptedSend } from "@/lib/session-composer-draft-store"
import { isVisibleTuiSurface } from "@/lib/tui-surface"
import { useModelCatalog } from "@/hooks/use-model-catalog"
import { sessionModelOptions } from "@/lib/session-model-options"
import type { Translator } from "@/lib/i18n"
import {
  activeExtensionRequest,
  reconcileExtensionRequestSnapshot,
  reconcileTuiSurfaceSnapshot,
  runAfterSessionEventCheckpoint,
  type ActiveExtensionRequest,
} from "@/lib/session-runtime-controller"

interface RuntimeStatePayload {
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
}

const PONYTAIL_MODES = ["lite", "full", "ultra"] as const
type PonytailMode = (typeof PONYTAIL_MODES)[number]

function ponytailMode(statusText: string): PonytailMode {
  const mode = stripAnsi(statusText).match(/\b(lite|full|ultra)\b/i)?.[1]
  return (mode?.toLowerCase() as PonytailMode | undefined) ?? "full"
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

function retryDescription(t: Translator, payload: unknown) {
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
  return t("session.runtime.retry", {
    attempt: payload.attempt,
    max: payload.maxAttempts,
  })
}

function parseRuntimeStatePayload(body: unknown): RuntimeStatePayload {
  if (
    typeof body !== "object" ||
    body === null ||
    !("status" in body) ||
    !("snapshot" in body)
  ) {
    throw new Error("Runtime returned an invalid state response.")
  }
  return {
    status: runtimeStatusSchema.parse(body.status),
    snapshot:
      body.snapshot === null
        ? null
        : runtimeSnapshotSchema.parse(body.snapshot),
  }
}

export function SessionRuntime({
  sessionId,
  mutationToken,
  initialStatus,
  initialSnapshot,
  initialGoalState,
  canConnect = true,
  canSend = true,
}: {
  sessionId: string
  mutationToken: string
  initialStatus: RuntimeStatus
  initialSnapshot: RuntimeSnapshot | null
  initialGoalState: PiGoalState | null
  canConnect?: boolean
  canSend?: boolean
}) {
  const { t } = useI18n()
  const sessionEvents = useSessionEvents()
  const sessionController = useSessionViewController()
  const runtimeController = sessionController.runtime
  const stream = useSessionStreaming()
  const composerDraftStore = useSessionComposerDraftStore()
  const runtimePresentation = useSyncExternalStore(
    runtimeController.subscribe,
    runtimeController.getSnapshot,
    runtimeController.getInitialSnapshot
  )
  const status =
    useStreamingRuntimeStatus() ?? runtimePresentation.status ?? initialStatus
  const snapshot =
    runtimePresentation.snapshot === undefined
      ? initialSnapshot
      : runtimePresentation.snapshot
  const setSnapshot = useCallback(
    (next: RuntimeSnapshot | null) => runtimeController.setSnapshot(next),
    [runtimeController]
  )
  useEffect(() => {
    if (
      runtimeController.getSnapshot().snapshot === undefined &&
      initialSnapshot !== null
    ) {
      runtimeController.setSnapshot(initialSnapshot)
    }
  }, [initialSnapshot, runtimeController])
  const [initialComposerDraft] = useState(() =>
    composerDraftStore.read(sessionId)
  )
  const [draft, setDraftState] = useState(initialComposerDraft.text)
  useEffect(() => {
    runtimeController.setDraftWriter((text) =>
      composerDraftStore.setText(sessionId, text)
    )
  }, [composerDraftStore, runtimeController, sessionId])
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)
  const goalReturnFocusRef = useRef<HTMLElement | null>(null)
  const setDraft = useCallback<Dispatch<SetStateAction<string>>>(
    (nextDraft) => {
      if (typeof nextDraft === "string") {
        composerDraftStore.setText(sessionId, nextDraft)
        setDraftState(nextDraft)
        return
      }
      setDraftState((current) => {
        const next = nextDraft(current)
        composerDraftStore.setText(sessionId, next)
        return next
      })
    },
    [composerDraftStore, sessionId]
  )
  const updateStoredComposerImages = useCallback(
    (images: ComposerImage[]) =>
      composerDraftStore.setImages(sessionId, images),
    [composerDraftStore, sessionId]
  )
  const composerImages = useComposerImages(
    initialComposerDraft.images,
    updateStoredComposerImages
  )
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
  const compacting = runtimePresentation.compacting
  const setCompacting = useCallback(
    (next: boolean) => runtimeController.update({ compacting: next }),
    [runtimeController]
  )
  const compactionNotice = runtimePresentation.compactionNotice
  const setCompactionNotice = useCallback(
    (next: "running" | "complete" | null) =>
      runtimeController.update({ compactionNotice: next }),
    [runtimeController]
  )
  const [commandNotice, setCommandNotice] = useState<string | null>(null)
  const compactRequestRef = useRef(false)
  const compactQueuedOptimistic = runtimePresentation.compactQueuedOptimistic
  const setCompactQueuedOptimistic = useCallback(
    (next: boolean) =>
      runtimeController.update({ compactQueuedOptimistic: next }),
    [runtimeController]
  )
  const [treeOpen, setTreeOpen] = useState(false)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [goalObjective, setGoalObjective] = useState("")
  const [goalTokenBudget, setGoalTokenBudget] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const leasePhase = runtimePresentation.leasePhase
  const leaseError = runtimePresentation.leaseError
  const leaseStarterRef = useRef<(() => void) | null>(null)
  const runtimeSessionGeneration = useRef(0)
  const connectionStateRef = useRef<"open" | "error" | null>(null)
  const queuedMessages = runtimePresentation.queuedMessages
  const setQueuedMessages = useCallback(
    (
      update:
        | QueuedPromptItem[]
        | ((current: QueuedPromptItem[]) => QueuedPromptItem[])
    ) => runtimeController.updateQueuedMessages(update),
    [runtimeController]
  )
  const retrying = runtimePresentation.retrying
  const setRetrying = useCallback(
    (next: string | null) => runtimeController.update({ retrying: next }),
    [runtimeController]
  )
  const extensionRequests = runtimePresentation.extensionRequests
  const setExtensionRequests = useCallback(
    (
      update:
        | ActiveExtensionRequest[]
        | ((current: ActiveExtensionRequest[]) => ActiveExtensionRequest[])
    ) => runtimeController.setExtensionRequests(update),
    [runtimeController]
  )
  const extensionRequestLoadBuffers = useRef(
    new Set<ActiveExtensionRequest[]>()
  )
  const closedExtensionRequestIds = useRef(new Set<string>())
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(
    null
  )
  const respondingExtensionRequestIds = useRef(new Set<string>())
  const extensionStatuses = runtimePresentation.extensionStatuses
  const setExtensionStatuses = useCallback(
    (
      update:
        | Record<string, string>
        | ((current: Record<string, string>) => Record<string, string>)
    ) => runtimeController.setExtensionStatuses(update),
    [runtimeController]
  )
  const extensionWidgets = runtimePresentation.extensionWidgets
  const tuiSurfaces = runtimePresentation.tuiSurfaces
  const setTuiSurfaces = useCallback(
    (
      update:
        | Record<string, TuiSurfaceSnapshot>
        | ((
            current: Record<string, TuiSurfaceSnapshot>
          ) => Record<string, TuiSurfaceSnapshot>)
    ) => runtimeController.setTuiSurfaces(update),
    [runtimeController]
  )
  const pendingSurfaceEvents = useRef(new Map<string, PendingSurfaceEvent[]>())
  const surfaceLoadBuffers = useRef(new Set<TuiSurfaceEvent[]>())
  const closingTuiSurfaceIds = useRef(new Set<string>())
  const wasBusy = useRef(status === "busy")
  const agentRunActive = useRef(status === "busy")
  const streamRevision = useRef(0)
  const completedStreamRevision = useRef<number | null>(null)
  const selectedModel = snapshot?.model
  const modelCatalog = useModelCatalog({ sessionId }, "enabled")
  const modelOptions = sessionModelOptions(modelCatalog)
  const currentModelSelectable = Boolean(
    selectedModel &&
    modelOptions.some(
      (model) =>
        model.provider === selectedModel.provider &&
        model.id === selectedModel.id
    )
  )
  const unavailableModelReason =
    modelCatalog.status === "idle" || modelCatalog.status === "loading"
      ? t("composer.model.catalogLoading")
      : modelCatalog.status === "error"
        ? t("composer.model.catalogError")
        : t("composer.model.unavailable")
  const queuedControl = (
    type: NonNullable<QueuedPromptItem["control"]>["type"]
  ) =>
    queuedMessages.find(
      (item) => item.kind === "control" && item.control?.type === type
    )?.control
  const queuedModel = queuedControl("model")?.value
  const queuedThinking = queuedControl("thinking")?.value
  const compactQueued =
    Boolean(queuedControl("compact")) || compactQueuedOptimistic
  const extensionRequest = extensionRequests[0] ?? null
  const extensionValue = extensionRequest?.value ?? ""
  const imagesSupported = snapshot
    ? selectedModel
      ? snapshot.availableModels.some(
          (model) =>
            model.provider === selectedModel.provider &&
            model.id === selectedModel.id &&
            model.input.includes("image")
        )
      : false
    : null

  const updateRuntimeStatus = useCallback(
    (nextStatus: RuntimeStatus) => {
      stream.setRuntimeStatus(nextStatus)
    },
    [stream]
  )

  const updateQueuedMessages = useCallback(
    (items: QueuedPromptItem[]) => {
      setQueuedMessages(items)
      if (
        !items.some(
          (item) => item.kind === "control" && item.control?.type === "compact"
        )
      ) {
        setCompactQueuedOptimistic(false)
      }
    },
    [setQueuedMessages, setCompactQueuedOptimistic]
  )

  const applyRuntimeState = useCallback(
    (nextState: RuntimeStatePayload) => {
      updateRuntimeStatus(nextState.status)
      setSnapshot(nextState.snapshot)
      updateQueuedMessages(nextState.snapshot?.queuedPrompts ?? [])
      setExtensionStatuses(nextState.snapshot?.extensionStatuses ?? {})
      setCompacting(nextState.snapshot?.isCompacting ?? false)
      setCompactionNotice(nextState.snapshot?.isCompacting ? "running" : null)
      agentRunActive.current = nextState.status === "busy"
      wasBusy.current = nextState.status === "busy"
    },
    [
      setCompactionNotice,
      setCompacting,
      setExtensionStatuses,
      setSnapshot,
      updateQueuedMessages,
      updateRuntimeStatus,
    ]
  )

  const mutate = useCallback(
    async <T,>(path: string, method: "POST" | "PUT", body?: unknown) => {
      if (!canConnect) {
        throw new Error(t("session.runtime.authorizationPending"))
      }
      const response = await fetch(path, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return responseJson<T>(
        response,
        response.ok
          ? t("session.runtime.emptyResponse")
          : t("session.runtime.operationFailed", { status: response.status })
      )
    },
    [canConnect, mutationToken, t]
  )

  async function sendMessage(
    rawMessage: string,
    options: { images?: ComposerImage[]; clearDraft?: boolean } = {}
  ) {
    const text = rawMessage.trim()
    const images = options.images ?? []
    if (
      (!text && images.length === 0) ||
      submittingRef.current ||
      abortingRef.current ||
      !canSend ||
      leasePhase !== "ready" ||
      !["ready", "busy"].includes(status)
    ) {
      return false
    }

    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    if (/^\/[^\s]+$/.test(text)) setCommandNotice(text)
    else setCommandNotice(null)
    try {
      await mutate(`/api/v1/sessions/${sessionId}/messages`, "POST", {
        message: text || t("session.runtime.imageOnlyMessage"),
        images: promptImages(images),
        streamingBehavior,
      })
      stream.requestFollow()
      if (options.clearDraft) {
        setDraft((current) => draftAfterAcceptedSend(current, rawMessage))
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

  const sendMessageRef = useRef(sendMessage)
  useLayoutEffect(() => {
    sendMessageRef.current = sendMessage
  })

  const sendTuiMessage = useEffectEvent((message: string) => {
    void sendMessage(message)
  })

  const clearExtensionUi = useEffectEvent(() => {
    for (const bufferedRequests of extensionRequestLoadBuffers.current) {
      bufferedRequests.length = 0
    }
    closedExtensionRequestIds.current.clear()
    setRespondingRequestId(null)
    respondingExtensionRequestIds.current.clear()
    document.title = "pi-web-codex"
  })

  const loadTuiSurfaces = useEffectEvent(async () => {
    const generation = runtimeController.getTuiGeneration()
    const sequence = runtimeController.beginTuiLoad()
    const bufferedEvents: TuiSurfaceEvent[] = []
    const pendingBeforeLoad = new Map(
      [...pendingSurfaceEvents.current].map(([surfaceId, events]) => [
        surfaceId,
        [...events],
      ])
    )
    surfaceLoadBuffers.current.add(bufferedEvents)
    try {
      const response = await runAfterSessionEventCheckpoint(
        sessionController.whenEventCheckpointReady(),
        () =>
          fetch(`/api/v1/sessions/${sessionId}/tui-surfaces`, {
            cache: "no-store",
          })
      )
      if (!response.ok) {
        throw new Error(
          t("session.runtime.tuiSyncFailed", { status: response.status })
        )
      }
      const snapshots = tuiSurfaceSnapshotsSchema.parse(await response.json())
      if (!runtimeController.isCurrentTuiLoad(sequence, generation)) {
        return
      }

      const reconciled = reconcileTuiSurfaceSnapshot(
        snapshots,
        pendingBeforeLoad,
        bufferedEvents
      )
      pendingSurfaceEvents.current = reconciled.pending
      setTuiSurfaces(reconciled.surfaces)
    } finally {
      surfaceLoadBuffers.current.delete(bufferedEvents)
    }
  })

  const loadExtensionRequests = useEffectEvent(async () => {
    const generation = runtimeController.getExtensionRequestGeneration()
    const sequence = runtimeController.beginExtensionRequestLoad()
    const bufferedRequests: ActiveExtensionRequest[] = []
    extensionRequestLoadBuffers.current.add(bufferedRequests)
    try {
      const response = await runAfterSessionEventCheckpoint(
        sessionController.whenEventCheckpointReady(),
        () =>
          fetch(`/api/v1/sessions/${sessionId}/extension-ui-requests`, {
            cache: "no-store",
          })
      )
      if (!response.ok) {
        throw new Error(
          t("session.runtime.extensionSyncFailed", {
            status: response.status,
          })
        )
      }
      const body = (await response.json()) as unknown
      if (!Array.isArray(body)) {
        throw new Error(t("session.runtime.extensionInvalidResponse"))
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
          throw new Error(t("session.runtime.extensionInvalidRequest"))
        }
        return activeExtensionRequest(
          item.requestId,
          extensionUIRequestSchema.parse(item.request),
          item.expiresAt
        )
      })
      if (
        !runtimeController.isCurrentExtensionRequestLoad(sequence, generation)
      ) {
        return
      }

      const reconciled = reconcileExtensionRequestSnapshot(
        loaded,
        bufferedRequests,
        closedExtensionRequestIds.current,
        now,
        runtimeController.getSnapshot().extensionRequests
      )
      closedExtensionRequestIds.current.clear()
      setExtensionRequests(reconciled)
    } finally {
      extensionRequestLoadBuffers.current.delete(bufferedRequests)
    }
  })

  const loadRuntimeState = useEffectEvent(
    async (
      expectedSessionId = sessionId,
      expectedSessionGeneration = runtimeSessionGeneration.current
    ) => {
      for (;;) {
        if (expectedSessionGeneration !== runtimeSessionGeneration.current)
          return
        const generation = runtimeController.getGeneration()
        const sequence = runtimeController.beginRuntimeStateLoad()
        const response = await runAfterSessionEventCheckpoint(
          sessionController.whenEventCheckpointReady(),
          () =>
            fetch(`/api/v1/sessions/${expectedSessionId}/runtime`, {
              cache: "no-store",
            })
        )
        const body = (await response.json()) as {
          status?: unknown
          snapshot?: unknown
          error?: string
        }
        if (!response.ok) {
          throw new Error(
            body.error ??
              t("session.runtime.stateSyncFailed", { status: response.status })
          )
        }
        const nextState = parseRuntimeStatePayload(body)
        if (
          !runtimeController.isCurrentRuntimeStateLoad(sequence, generation)
        ) {
          if (generation !== runtimeController.getGeneration()) continue
          return
        }
        if (expectedSessionGeneration !== runtimeSessionGeneration.current)
          return

        applyRuntimeState(nextState)
        return
      }
    }
  )

  async function actOnTuiSurface(surfaceId: string, action: TuiSurfaceAction) {
    await mutate(`/api/v1/tui-surfaces/${surfaceId}`, "POST", {
      sessionId,
      action,
    })
  }

  useEffect(() => {
    let disposed = false
    runtimeSessionGeneration.current++
    const reconnect = () => {
      if (!disposed && canConnect) runtimeController.reconnectLeaseIfRunning()
    }
    leaseStarterRef.current = reconnect
    if (canConnect) runtimeController.retainLease(mutationToken)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reconnect()
    }
    window.addEventListener("online", reconnect)
    document.addEventListener("visibilitychange", onVisibilityChange)

    const expectedSessionGeneration = runtimeSessionGeneration.current
    if (canConnect) {
      void Promise.all([
        loadRuntimeState(sessionId, expectedSessionGeneration),
        loadTuiSurfaces(),
        loadExtensionRequests(),
      ]).catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure))
      )
    }
    const handoffTranscript = () => {
      completedStreamRevision.current = streamRevision.current
    }
    const handle = (source: Event) => {
      const event = parseSessionLiveEvent(source)
      if (runtimeController.isStaleRuntimeSnapshotEvent(event)) return
      if (event.type === "runtime.starting") {
        streamRevision.current += 1
        agentRunActive.current = false
        completedStreamRevision.current = null

        updateRuntimeStatus("starting")
        pendingSurfaceEvents.current.clear()
        closingTuiSurfaceIds.current.clear()
        clearExtensionUi()
      }
      if (event.type === "runtime.ready") {
        const nextSnapshot = runtimeSnapshotSchema.parse(event.payload)
        updateRuntimeStatus(
          nextSnapshot.isStreaming || nextSnapshot.isCompacting
            ? "busy"
            : "ready"
        )
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
          notifyWhenHidden(
            t("session.runtime.completedTitle"),
            t("session.runtime.completedBody")
          )
          wasBusy.current = false
        }
      }
      if (event.type === "runtime.stopping") updateRuntimeStatus("stopping")
      if (event.type === "runtime.stopped") {
        if (agentRunActive.current) {
          agentRunActive.current = false
          handoffTranscript()
        }
        updateRuntimeStatus("stopped")
        pendingSurfaceEvents.current.clear()
        closingTuiSurfaceIds.current.clear()
        clearExtensionUi()
      }
      if (event.type === "runtime.crashed") {
        if (agentRunActive.current) {
          agentRunActive.current = false
          handoffTranscript()
        }
        wasBusy.current = false
        updateRuntimeStatus("crashed")
        pendingSurfaceEvents.current.clear()
        closingTuiSurfaceIds.current.clear()
        clearExtensionUi()
        setError(t("session.runtime.crashMessage"))
        notifyWhenHidden(
          t("session.runtime.crashTitle"),
          t("session.runtime.crashBody")
        )
      }
      if (event.type === "session.message.start") {
        if (!agentRunActive.current) {
          agentRunActive.current = true
          streamRevision.current += 1
          completedStreamRevision.current = null
        }
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
      }

      if (event.type === "queue.updated") {
        // SessionRuntimeController owns the queued prompt state.
      }
      if (event.type === "compaction.start") {
        updateRuntimeStatus("busy")
      }
      if (event.type === "compaction.end") {
        const outcome = compactionEndOutcome(event.payload)
        if (outcome.kind === "failed") setError(outcome.message)
      }
      if (event.type === "retry.start") {
        setRetrying(retryDescription(t, event.payload))
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
          notifyWhenHidden(t("session.extension.defaultTitle"), request.message)
        } else if (
          request.method === "setStatus" ||
          request.method === "setWidget"
        ) {
          // SessionRuntimeController owns extension status and widget state.
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
      }
      if (event.type === "resync.required") {
        completedStreamRevision.current = null

        agentRunActive.current = false
        wasBusy.current = false
        clearExtensionUi()
        pendingSurfaceEvents.current.clear()
        closingTuiSurfaceIds.current.clear()
        for (const bufferedEvents of surfaceLoadBuffers.current) {
          bufferedEvents.length = 0
        }
        setError(null)
        void Promise.all([
          loadRuntimeState(),
          loadTuiSurfaces(),
          loadExtensionRequests(),
        ]).catch((failure: unknown) =>
          setError(failure instanceof Error ? failure.message : String(failure))
        )
      }
    }

    const unsubscribeEvents = sessionEvents.subscribe(EVENT_TYPES, handle)
    const unsubscribeConnection = sessionEvents.subscribeConnection((state) => {
      const previous = connectionStateRef.current
      connectionStateRef.current = state
      setConnectionError(
        state === "error" ? t("session.runtime.connectionLost") : null
      )
      if (state === "open" && previous === "error") {
        if (canConnect) {
          runtimeController.reconnectLeaseIfRunning()
          void Promise.all([
            loadRuntimeState(sessionId, expectedSessionGeneration),
            loadTuiSurfaces(),
            loadExtensionRequests(),
          ]).catch((failure: unknown) =>
            setError(
              failure instanceof Error ? failure.message : String(failure)
            )
          )
        }
      }
    })
    return () => {
      disposed = true
      runtimeSessionGeneration.current += 1
      window.removeEventListener("online", reconnect)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      if (leaseStarterRef.current === reconnect) leaseStarterRef.current = null
      if (canConnect) runtimeController.releaseLease()
      unsubscribeEvents()
      unsubscribeConnection()
    }
  }, [
    applyRuntimeState,
    mutationToken,
    sessionEvents,
    sessionId,
    setDraft,
    stream,
    canConnect,
    canSend,
    t,
    updateQueuedMessages,
    updateRuntimeStatus,
    runtimeController,
    setRetrying,
  ])

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
  }, [extensionRequest, setExtensionRequests])

  useEffect(
    () => () => {
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
      updateQueuedMessages(state.snapshot?.queuedPrompts ?? [])
      setCompacting(state.snapshot?.isCompacting ?? false)
      setCompactionNotice(state.snapshot?.isCompacting ? "running" : null)
      leaseStarterRef.current?.()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      updatingRef.current = false
      setUpdating(false)
    }
  }

  function setPonytailMode(mode: string) {
    if (!PONYTAIL_MODES.includes(mode as PonytailMode)) {
      throw new Error("Ponytail returned an invalid mode.")
    }
    void sendMessage(`/ponytail ${mode}`)
  }

  const setModel = useCallback(
    async (model: RuntimeSnapshot["availableModels"][number]) => {
      if (status === "busy") {
        await sendMessageRef.current(`/model ${model.provider}/${model.id}`)
        return
      }
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
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure))
      } finally {
        updatingRef.current = false
        setUpdating(false)
      }
    },
    [mutate, sessionId, setSnapshot, status]
  )

  const setThinkingLevel = useCallback(
    async (level: RuntimeSnapshot["thinkingLevel"]) => {
      if (status === "busy") {
        await sendMessageRef.current(`/thinking ${level}`)
        return
      }
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
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure))
      } finally {
        updatingRef.current = false
        setUpdating(false)
      }
    },
    [mutate, sessionId, setSnapshot, status]
  )

  const onModelChange = useCallback(
    (model: RuntimeSnapshot["availableModels"][number]) => {
      void setModel(model)
    },
    [setModel]
  )
  const onThinkingLevelChange = useCallback(
    (level: RuntimeSnapshot["thinkingLevel"]) => {
      void setThinkingLevel(level)
    },
    [setThinkingLevel]
  )

  async function reload() {
    if (updatingRef.current) return
    updatingRef.current = true
    setUpdating(true)
    setError(null)
    try {
      const nextSnapshot = await mutate<RuntimeSnapshot>(
        `/api/v1/sessions/${sessionId}/reload`,
        "POST"
      )
      setSnapshot(nextSnapshot)
      updateQueuedMessages(nextSnapshot.queuedPrompts)
      toast.success(t("session.runtime.reloadSuccess"))
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
    const revisionAtStart = runtimeController.getSnapshot().queueRevision
    setQueueUpdating(true)
    setError(null)
    try {
      const state = queueStateSchema.parse(
        await mutate(`/api/v1/sessions/${sessionId}/queue`, "PUT", {
          expected: queuedMessages,
          next,
        })
      )
      const currentRevision = runtimeController.getSnapshot().queueRevision
      runtimeController.setQueuedMessagesFromMutation(
        reconcilePromptQueueMutation(
          runtimeController.getSnapshot().queuedMessages,
          state.items,
          revisionAtStart,
          currentRevision
        )
      )
      if (revisionAtStart === currentRevision) {
        setCompactQueuedOptimistic(
          state.items.some(
            (item) =>
              item.kind === "control" && item.control?.type === "compact"
          )
        )
      }
    } catch (failure) {
      const error =
        failure instanceof ApiError && failure.code === "QueueConflict"
          ? new ApiError(t("session.queue.conflict"), failure.code)
          : failure
      setError(error instanceof Error ? error.message : String(error))
      throw error
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
    if (compacting || compactRequestRef.current || compactQueued) return
    if (status === "busy") {
      setCompactQueuedOptimistic(true)
      if (!(await sendMessage("/compact"))) setCompactQueuedOptimistic(false)
      return
    }
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

  function openGoalDialog(returnFocus: HTMLElement | null) {
    goalReturnFocusRef.current = returnFocus
    setGoalDialogOpen(true)
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
        throw new Error(
          body.error ?? t("session.runtime.extensionResponseFailed")
        )
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
  const runtimeActive = ["starting", "ready", "busy", "stopping"].includes(
    status
  )
  const runtimeStatusLabel = t(
    runtimeActive ? "session.runtime.active" : "session.runtime.inactive"
  )
  const settingsDisabled =
    !canConnect ||
    leasePhase !== "ready" ||
    !["ready", "busy"].includes(status) ||
    updating ||
    compacting
  const reloadDisabled =
    !canConnect ||
    ["starting", "busy", "stopping", "crashed"].includes(status) ||
    updating ||
    compacting
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

  const slashCommands = (snapshot?.slashCommands ?? [])
    .filter(
      (command) => !["goal", "compact", "reload", "tree"].includes(command.name)
    )
    .map((command) => ({
      id: `slash:${command.name}`,
      label: `/${command.name}`,
      description: composerCommandDescription(
        command.description ?? `/${command.name}`
      ),
      icon:
        command.source === "skill"
          ? SparklesIcon
          : command.source === "prompt"
            ? FileTextIcon
            : TerminalIcon,
      disabled:
        !canSend ||
        leasePhase !== "ready" ||
        submitting ||
        aborting ||
        status === "crashed" ||
        status === "stopping",
      onSelect: () =>
        void sendMessage(`/${command.name}`, { clearDraft: true }),
    }))

  return (
    <div className="z-10 shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
      <div className="mx-auto flex w-full max-w-[52rem] min-w-0 flex-col gap-3">
        <div className="grid max-h-[18svh] min-h-0 gap-3 overflow-y-auto overscroll-contain empty:hidden">
          {inlineSurfaces("header").map(renderTuiSurface)}
          {compactionNotice ? (
            <ConversationCompactionStatus state={compactionNotice} />
          ) : null}
          {commandNotice ? (
            <p
              role="status"
              className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              {t("session.runtime.commandInvoked", { command: commandNotice })}
            </p>
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
            disabled={
              !canConnect || status === "starting" || status === "crashed"
            }
            queueCommands={isBusy}
            onCommand={(args) => sendMessage(`/goal ${args}`)}
          />
          <ExtensionSlot name="composer.above" excludeViewIds={["goal.card"]} />
          <PromptQueue
            items={queuedMessages}
            onReplace={replaceQueuedMessages}
            disabled={
              !canConnect ||
              leasePhase !== "ready" ||
              submitting ||
              aborting ||
              queueUpdating
            }
            fallbackFocusRef={composerTextareaRef}
          />
        </div>
        <ConversationComposer
          value={draft}
          onValueChange={setDraft}
          onSubmit={submit}
          submitting={submitting}
          sendDisabled={
            !canSend ||
            leasePhase !== "ready" ||
            !["ready", "busy"].includes(status) ||
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
                      snapshot.availableThinkingLevels,
                      t
                    )
                  )
              : undefined
          }
          onDecreaseThinkingLevel={
            snapshot &&
            snapshot.availableThinkingLevels.length > 1 &&
            !settingsDisabled
              ? () =>
                  void setThinkingLevel(
                    adjacentThinkingLevel(
                      snapshot.thinkingLevel,
                      snapshot.availableThinkingLevels,
                      -1,
                      t
                    )
                  )
              : undefined
          }
          onIncreaseThinkingLevel={
            snapshot &&
            snapshot.availableThinkingLevels.length > 1 &&
            !settingsDisabled
              ? () =>
                  void setThinkingLevel(
                    adjacentThinkingLevel(
                      snapshot.thinkingLevel,
                      snapshot.availableThinkingLevels,
                      1,
                      t
                    )
                  )
              : undefined
          }
          textareaRef={composerTextareaRef}
          commands={[
            ...(goalAvailable
              ? [
                  {
                    id: "goal",
                    label: t("session.command.goal"),
                    description: t("session.command.goalDescription"),
                    icon: TargetIcon,
                    disabled: settingsDisabled,
                    onSelect: () => openGoalDialog(composerTextareaRef.current),
                  },
                ]
              : []),
            {
              id: "compact",
              label: t("session.command.compact"),
              description: t("session.command.compactDescription"),
              icon: Minimize2Icon,
              disabled: settingsDisabled || compactQueued,
              onSelect: () => void compact(),
            },
            {
              id: "reload",
              label: t("session.command.reload"),
              description: t("session.command.reloadDescription"),
              icon: RefreshCwIcon,
              disabled: reloadDisabled,
              onSelect: () => void reload(),
            },
            {
              id: "tree",
              label: t("session.command.tree"),
              description: t("session.command.treeDescription"),
              icon: GitMergeIcon,
              disabled: ["starting", "busy", "stopping", "crashed"].includes(
                status
              ),
              onSelect: () => setTreeOpen(true),
            },
            ...slashCommands,
          ]}
          sessionControls={{
            goal: goalAvailable
              ? {
                  disabled: settingsDisabled,
                  onClick: () => openGoalDialog(composerTextareaRef.current),
                }
              : undefined,
            runtime: {
              active: runtimeActive,
              label: runtimeStatusLabel,
            },
            compact: {
              disabled: settingsDisabled || compactQueued,
              pending: compacting || compactQueued,
              onClick: compact,
            },
          }}
          editor={
            editorSurface ? (
              <div className="max-h-[30svh] overflow-y-auto overscroll-contain">
                <PiTuiSurface
                  surface={editorSurface}
                  onAction={(action) =>
                    actOnTuiSurface(editorSurface.surfaceId, action)
                  }
                  onError={(failure) => setError(failure.message)}
                />
              </div>
            ) : undefined
          }
          actions={
            <>
              <SessionStreamingToolStatus />
              {!canConnect ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="text-xs text-muted-foreground"
                >
                  {t("session.runtime.authorizationPending")}
                </span>
              ) : leasePhase === "connecting" ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  {t("session.status.starting")}
                </span>
              ) : null}
              {composerImages.loading ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  {t("session.runtime.imageReading")}
                </span>
              ) : null}
              {retrying ? (
                <span className="text-xs text-muted-foreground">
                  {retrying}
                </span>
              ) : null}
              {Object.entries(extensionStatuses).map(([key, text]) =>
                key === "ponytail" ? (
                  <Select
                    key={key}
                    value={ponytailMode(text)}
                    onValueChange={setPonytailMode}
                    disabled={settingsDisabled || submitting}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t("session.runtime.ponytailMode")}
                    >
                      <SelectValue>
                        {t("session.runtime.ponytailLevel", {
                          level: ponytailMode(text),
                        })}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent position="popper" side="top">
                      {PONYTAIL_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {t("session.runtime.ponytailLevel", { level: mode })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span
                    key={key}
                    className="max-w-[12rem] truncate text-xs text-muted-foreground"
                    title={stripAnsi(text)}
                  >
                    {stripAnsi(text)}
                  </span>
                )
              )}
              <ExtensionSlot name="composer.actions" />
            </>
          }
          endActions={
            <>
              {isBusy ? (
                <Select
                  value={streamingBehavior}
                  onValueChange={selectStreamingBehavior}
                  disabled={!canConnect || aborting}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={t("session.runtime.queueMode")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="top">
                    <SelectItem value="followUp">
                      {t("session.runtime.followUp")}
                    </SelectItem>
                    <SelectItem value="steer">
                      {t("session.runtime.steer")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {isBusy ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={abort}
                  aria-label={t("session.runtime.abort")}
                  disabled={!canConnect || aborting}
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
                {snapshot.model ? (
                  <ComposerModelSelect
                    model={
                      queuedModel
                        ? (modelOptions.find(
                            (model) =>
                              `${model.provider}/${model.id}` === queuedModel
                          ) ?? snapshot.model)
                        : snapshot.model
                    }
                    models={modelOptions}
                    onModelChange={onModelChange}
                    disabled={settingsDisabled}
                    settingsHref={`/settings/models?sessionId=${encodeURIComponent(sessionId)}`}
                    unavailableModelLabel={
                      snapshot.model && !currentModelSelectable
                        ? `${snapshot.model.provider} / ${snapshot.model.name}`
                        : null
                    }
                    unavailableModelReason={
                      snapshot.model && !currentModelSelectable
                        ? unavailableModelReason
                        : null
                    }
                  />
                ) : null}
                <ComposerThinkingSelect
                  level={
                    (queuedThinking as RuntimeSnapshot["thinkingLevel"]) ??
                    snapshot.thinkingLevel
                  }
                  levels={snapshot.availableThinkingLevels}
                  onLevelChange={onThinkingLevelChange}
                  disabled={settingsDisabled}
                />
              </>
            ) : null
          }
        />
        <SessionTreeViewer
          sessionId={sessionId}
          mutationToken={mutationToken}
          open={treeOpen}
          onOpenChange={setTreeOpen}
          returnFocusRef={composerTextareaRef}
        />
        <div className="grid max-h-[18svh] min-h-0 gap-3 overflow-y-auto overscroll-contain empty:hidden">
          {status === "crashed" ||
          (status === "stopped" && leasePhase === "paused") ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p role="alert" className="text-sm text-destructive">
                {status === "crashed"
                  ? (error ?? t("session.runtime.crashMessage"))
                  : t("session.runtime.inactive")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void restartRuntime()}
                disabled={!canConnect || updating}
              >
                <RefreshCwIcon
                  className={updating ? "animate-spin" : undefined}
                />
                {t("session.runtime.restart")}
              </Button>
            </div>
          ) : leasePhase === "error" && leaseError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p role="alert" className="text-sm text-destructive">
                {leaseError}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  runtimeController.retryLease()
                }}
              >
                <RefreshCwIcon />
                {t("app.error.retry")}
              </Button>
            </div>
          ) : error || connectionError ? (
            <p role="alert" className="text-sm text-destructive">
              {error ?? connectionError}
            </p>
          ) : null}
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
        </div>
      </div>

      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const focusTarget =
              goalReturnFocusRef.current ?? composerTextareaRef.current
            focusTarget?.focus()
            goalReturnFocusRef.current = null
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("session.goal.startTitle")}</DialogTitle>
            <DialogDescription>
              {t("session.goal.startDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Textarea
              value={goalObjective}
              onChange={(event) => setGoalObjective(event.target.value)}
              placeholder={t("session.goal.objectivePlaceholder")}
              aria-label={t("session.goal.objective")}
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
              placeholder={t("session.goal.tokenBudgetOptional")}
              aria-label={t("session.goal.tokenBudget")}
              aria-invalid={!goalTokenBudgetValid}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>
              {t("session.goal.cancel")}
            </Button>
            <Button
              onClick={() => void startGoal()}
              disabled={
                !goalObjective.trim() || !goalTokenBudgetValid || submitting
              }
            >
              {t("session.goal.start")}
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
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            composerTextareaRef.current?.focus()
          }}
        >
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

              {extensionRequest.method !== "confirm" ? (
                <Label htmlFor="extension-request-value" className="sr-only">
                  {extensionRequest.title}
                </Label>
              ) : null}

              {extensionRequest.method === "select" ? (
                <Select
                  value={extensionValue}
                  onValueChange={updateExtensionValue}
                  disabled={respondingRequestId !== null}
                >
                  <SelectTrigger
                    id="extension-request-value"
                    className="w-full"
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
                  id="extension-request-value"
                  value={extensionValue}
                  onChange={(event) => updateExtensionValue(event.target.value)}
                  placeholder={extensionRequest.placeholder}
                  autoFocus
                  disabled={respondingRequestId !== null}
                />
              ) : null}

              {extensionRequest.method === "editor" ? (
                <Textarea
                  id="extension-request-value"
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
                  {t("session.runtime.extensionCancel")}
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
                  {t("session.runtime.extensionConfirm")}
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
        <DialogContent
          className="sm:max-w-4xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            composerTextareaRef.current?.focus()
          }}
        >
          {modalSurface ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {modalSurface.title ?? t("session.extension.defaultTitle")}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {t("session.extension.tuiDescription")}
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
