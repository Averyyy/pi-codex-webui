"use client"

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
  GitMergeIcon,
  LoaderCircleIcon,
  Minimize2Icon,
  RefreshCwIcon,
  SquareIcon,
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
  RuntimeSnapshot,
  RuntimeStatus,
  TuiSurfaceAction,
  TuiSurfaceEvent,
  TuiSurfaceSnapshot,
} from "@workspace/runtime-protocol"
import {
  extensionUIRequestSchema,
  tuiSurfaceEventSchema,
  tuiSurfaceSnapshotsSchema,
} from "@workspace/runtime-protocol"

import { Markdown } from "@/components/markdown"
import { PiTuiSurface } from "@/components/pi-tui-surface"
import { ConversationDisclosure } from "@/components/conversation-disclosure"
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
import { stripAnsi } from "@/lib/ansi"
import { notifyWhenHidden } from "@/lib/browser-notifications"
import { compactionEndOutcome } from "@/lib/compaction-events"
import { formatInlinePreview } from "@/lib/session-display"

interface RuntimeEvent {
  type: string
  payload: unknown
}

interface PiMessage {
  role: string
  content: unknown
}

type ActiveExtensionRequest = Extract<
  ExtensionUIRequest,
  { method: "select" | "confirm" | "input" | "editor" }
> & { requestId: string }

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
  return message as PiMessage
}

function streamingContent(message: PiMessage) {
  if (!Array.isArray(message.content)) return { text: "", thinking: "" }
  let text = ""
  let thinking = ""
  for (const part of message.content) {
    if (typeof part !== "object" || part === null || !("type" in part)) {
      throw new Error("Runtime emitted an invalid assistant content part.")
    }
    if (
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      text += part.text
    }
    if (
      part.type === "thinking" &&
      "thinking" in part &&
      typeof part.thinking === "string"
    ) {
      thinking += part.thinking
    }
  }
  return { text, thinking }
}

function toolName(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("toolName" in payload) ||
    typeof payload.toolName !== "string"
  ) {
    throw new Error("Runtime emitted an invalid tool event.")
  }
  return payload.toolName
}

function queueSize(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("steering" in payload) ||
    !Array.isArray(payload.steering) ||
    !("followUp" in payload) ||
    !Array.isArray(payload.followUp)
  ) {
    throw new Error("Runtime emitted an invalid queue event.")
  }
  return payload.steering.length + payload.followUp.length
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
}: {
  sessionId: string
  mutationToken: string
  initialEventCursor: string
  initialStatus: RuntimeStatus
  initialSnapshot: RuntimeSnapshot | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [draft, setDraft] = useState("")
  const composerImages = useComposerImages()
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const [compactionNotice, setCompactionNotice] = useState<
    "running" | "complete" | null
  >(null)
  const [treeOpen, setTreeOpen] = useState(false)
  const [streamingBehavior, setStreamingBehavior] = useState<
    "steer" | "followUp"
  >("followUp")
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState({ text: "", thinking: "" })
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [queuedMessages, setQueuedMessages] = useState(0)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [extensionRequest, setExtensionRequest] =
    useState<ActiveExtensionRequest | null>(null)
  const [extensionValue, setExtensionValue] = useState("")
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
  const closedSurfaces = useRef(new Set<string>())
  const wasBusy = useRef(false)
  const selectedModel = snapshot?.model
  const imagesSupported = selectedModel
    ? snapshot.availableModels.some(
        (model) =>
          model.provider === selectedModel.provider &&
          model.id === selectedModel.id &&
          model.input.includes("image")
      )
    : false

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
    if ((!text && images.length === 0) || submitting) return

    setSubmitting(true)
    setError(null)
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
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSubmitting(false)
    }
  }

  const sendTuiMessage = useEffectEvent((message: string) => {
    void sendMessage(message)
  })

  const loadTuiSurfaces = useEffectEvent(async () => {
    const response = await fetch(`/api/v1/sessions/${sessionId}/tui-surfaces`, {
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(`TUI surfaces 同步失败（HTTP ${response.status}）。`)
    }
    const snapshots = tuiSurfaceSnapshotsSchema.parse(await response.json())
    setTuiSurfaces((current) => {
      const next = { ...current }
      for (const snapshot of snapshots) {
        if (closedSurfaces.current.has(snapshot.surfaceId)) continue
        const existing = current[snapshot.surfaceId]
        const base =
          existing && existing.revision >= snapshot.revision
            ? existing
            : snapshot
        const pending = pendingSurfaceEvents.current.get(snapshot.surfaceId)
        next[snapshot.surfaceId] = pending
          ? applySurfaceEvents(base, pending)
          : base
        pendingSurfaceEvents.current.delete(snapshot.surfaceId)
      }
      return next
    })
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
    void loadTuiSurfaces().catch((failure: unknown) =>
      setError(failure instanceof Error ? failure.message : String(failure))
    )
    const handle = (source: Event) => {
      const event = JSON.parse(
        (source as MessageEvent<string>).data
      ) as RuntimeEvent
      if (event.type === "runtime.starting") {
        setStatus("starting")
        setTuiSurfaces({})
        pendingSurfaceEvents.current.clear()
        closedSurfaces.current.clear()
      }
      if (event.type === "runtime.ready") {
        setStatus("ready")
        setSnapshot(event.payload as RuntimeSnapshot)
        setError(null)
        void loadTuiSurfaces().catch((failure: unknown) =>
          setError(failure instanceof Error ? failure.message : String(failure))
        )
      }
      if (event.type === "runtime.busy") {
        wasBusy.current = true
        setStatus("busy")
      }
      if (event.type === "runtime.idle") {
        setStatus("ready")
        if (wasBusy.current) {
          notifyWhenHidden("Pi 已完成", "当前 Agent 轮次已结束。")
          wasBusy.current = false
        }
      }
      if (event.type === "runtime.stopping") setStatus("stopping")
      if (event.type === "runtime.stopped") {
        setStatus("stopped")
        setSnapshot(null)
        setTuiSurfaces({})
        pendingSurfaceEvents.current.clear()
        closedSurfaces.current.clear()
      }
      if (event.type === "runtime.crashed") {
        wasBusy.current = false
        setStatus("crashed")
        setTuiSurfaces({})
        pendingSurfaceEvents.current.clear()
        closedSurfaces.current.clear()
        setError("Pi worker 意外退出；历史 JSONL 仍可读取。")
        notifyWhenHidden(
          "Pi Runtime 已崩溃",
          "历史内容仍可读取，可回到 session 显式重启。"
        )
      }
      if (
        event.type === "session.message.start" ||
        event.type === "session.message.update"
      ) {
        const message = messageFromPayload(event.payload)
        if (message?.role === "assistant")
          setStreaming(streamingContent(message))
      }
      if (event.type === "session.message.end") {
        const message = messageFromPayload(event.payload)
        if (message?.role === "assistant") {
          setStreaming({ text: "", thinking: "" })
          router.refresh()
        }
      }
      if (event.type === "session.entry.appended") router.refresh()
      if (event.type === "session.completed") {
        setStatus("ready")
        setStreaming({ text: "", thinking: "" })
        setActiveTool(null)
        setRetrying(null)
        router.refresh()
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
        router.refresh()
      }
      if (
        event.type === "tool.execution.start" ||
        event.type === "tool.execution.update"
      ) {
        setActiveTool(toolName(event.payload))
      }
      if (event.type === "tool.execution.end") setActiveTool(null)
      if (event.type === "queue.updated") {
        setQueuedMessages(queueSize(event.payload))
      }
      if (event.type === "compaction.start") {
        setCompacting(true)
        setCompactionNotice("running")
        setStatus("busy")
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
        if (tuiEvent.kind === "open") {
          const id = tuiEvent.surface.surfaceId
          closedSurfaces.current.delete(id)
          setTuiSurfaces((current) => {
            const existing = current[id]
            const base =
              existing && existing.revision >= tuiEvent.surface.revision
                ? existing
                : tuiEvent.surface
            const pending = pendingSurfaceEvents.current.get(id)
            pendingSurfaceEvents.current.delete(id)
            return {
              ...current,
              [id]: pending ? applySurfaceEvents(base, pending) : base,
            }
          })
        } else if (tuiEvent.kind === "close") {
          closedSurfaces.current.add(tuiEvent.surfaceId)
          pendingSurfaceEvents.current.delete(tuiEvent.surfaceId)
          setTuiSurfaces((current) => {
            const next = { ...current }
            delete next[tuiEvent.surfaceId]
            return next
          })
          if (tuiEvent.value !== undefined) setDraft(tuiEvent.value)
        } else if (tuiEvent.kind === "submit") {
          sendTuiMessage(tuiEvent.value)
        } else {
          setTuiSurfaces((current) => {
            const surface = current[tuiEvent.surfaceId]
            if (!surface) {
              const pending =
                pendingSurfaceEvents.current.get(tuiEvent.surfaceId) ?? []
              pending.push(tuiEvent)
              pendingSurfaceEvents.current.set(tuiEvent.surfaceId, pending)
              return current
            }
            return {
              ...current,
              [tuiEvent.surfaceId]: applySurfaceEvents(surface, [tuiEvent]),
            }
          })
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
          setExtensionValue(
            request.method === "editor"
              ? (request.prefill ?? "")
              : request.method === "select"
                ? (request.options[0] ?? "")
                : ""
          )
          setExtensionRequest({
            ...request,
            requestId: event.payload.requestId,
          })
        }
      }
      if (event.type === "resync.required") {
        router.refresh()
        void loadTuiSurfaces().catch((failure: unknown) =>
          setError(failure instanceof Error ? failure.message : String(failure))
        )
      }
    }

    for (const type of EVENT_TYPES) events.addEventListener(type, handle)
    events.onerror = () => {
      setError("实时连接已断开；浏览器正在自动重连。")
    }
    events.onopen = () => setError(null)
    return () => events.close()
  }, [initialEventCursor, router, sessionId])

  useEffect(() => {
    if (!extensionRequest || !("timeout" in extensionRequest)) return
    const timeout = extensionRequest.timeout
    if (!timeout) return
    const requestId = extensionRequest.requestId
    const timer = window.setTimeout(() => {
      setExtensionRequest((current) =>
        current?.requestId === requestId ? null : current
      )
    }, timeout)
    return () => window.clearTimeout(timer)
  }, [extensionRequest])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendMessage(draft, {
      images: composerImages.images,
      clearDraft: true,
    })
  }

  async function abort() {
    setError(null)
    try {
      await mutate(`/api/v1/sessions/${sessionId}/abort`, "POST")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  async function restartRuntime() {
    setUpdating(true)
    setError(null)
    try {
      const state = await mutate<{
        status: RuntimeStatus
        snapshot: RuntimeSnapshot | null
      }>(`/api/v1/sessions/${sessionId}/activate`, "POST")
      setStatus(state.status)
      setSnapshot(state.snapshot)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setUpdating(false)
    }
  }

  async function setModel(model: RuntimeSnapshot["availableModels"][number]) {
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
      setUpdating(false)
    }
  }

  async function setThinkingLevel(level: RuntimeSnapshot["thinkingLevel"]) {
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
      setUpdating(false)
    }
  }

  function selectStreamingBehavior(value: string) {
    if (value !== "steer" && value !== "followUp") {
      throw new Error("Pi returned an invalid queue behavior.")
    }
    setStreamingBehavior(value)
  }

  async function compact() {
    setError(null)
    try {
      const result = await mutate<{ snapshot: RuntimeSnapshot }>(
        `/api/v1/sessions/${sessionId}/compact`,
        "POST",
        {}
      )
      setSnapshot(result.snapshot)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  async function respondToExtensionUI(response: ExtensionUIResponse) {
    if (!extensionRequest) return
    const requestId = extensionRequest.requestId
    setError(null)
    try {
      const result = await fetch(`/api/v1/extension-ui/${requestId}/respond`, {
        method: "POST",
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
      setExtensionRequest(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const isBusy = status === "busy"
  const settingsDisabled =
    isBusy || updating || compacting || status === "crashed"
  const hasStreamingContent = streaming.text || streaming.thinking
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
      (surface) => surface.mode === "inline" && surface.placement === placement
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
        {hasStreamingContent ? (
          <div className="flex max-h-64 min-w-0 flex-col gap-2 overflow-y-auto border-l pl-3 text-sm">
            {streaming.thinking ? (
              <ConversationDisclosure
                label="思考中"
                preview={formatInlinePreview(streaming.thinking)}
                icon={<LoaderCircleIcon className="animate-spin" />}
                ariaLabel="展开正在生成的思考"
                contentClassName="text-xs text-muted-foreground"
              >
                <p className="whitespace-pre-wrap">{streaming.thinking}</p>
              </ConversationDisclosure>
            ) : null}
            {streaming.text ? <Markdown>{streaming.text}</Markdown> : null}
          </div>
        ) : null}
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
        <ExtensionSlot name="composer.above" />
        <ConversationComposer
          value={draft}
          onValueChange={setDraft}
          onSubmit={submit}
          submitting={submitting}
          sendDisabled={status === "crashed"}
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
              disabled: status === "crashed",
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
              <Badge
                variant={status === "crashed" ? "destructive" : "secondary"}
              >
                {STATUS_LABELS[status]}
              </Badge>
              {activeTool ? (
                <span className="text-xs text-muted-foreground">
                  正在执行 {activeTool}
                </span>
              ) : null}
              {queuedMessages ? (
                <span className="text-xs text-muted-foreground">
                  队列 {queuedMessages}
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
                >
                  <SquareIcon />
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
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </div>

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
                  onValueChange={setExtensionValue}
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
                  onChange={(event) => setExtensionValue(event.target.value)}
                  placeholder={extensionRequest.placeholder}
                  autoFocus
                />
              ) : null}

              {extensionRequest.method === "editor" ? (
                <Textarea
                  value={extensionValue}
                  onChange={(event) => setExtensionValue(event.target.value)}
                  className="min-h-56"
                  autoFocus
                />
              ) : null}

              <DialogFooter>
                <Button
                  variant="outline"
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
                    extensionRequest.method === "select" && !extensionValue
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
            void actOnTuiSurface(modalSurface.surfaceId, {
              version: 1,
              action: "close",
            }).catch((failure: unknown) =>
              setError(
                failure instanceof Error ? failure.message : String(failure)
              )
            )
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
