"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  LoaderCircleIcon,
  Minimize2Icon,
  SendIcon,
  SquareIcon,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import type {
  RuntimeSnapshot,
  RuntimeStatus,
} from "@workspace/runtime-protocol"

import { Markdown } from "@/components/markdown"

interface RuntimeEvent {
  type: string
  payload: unknown
}

interface PiMessage {
  role: string
  content: unknown
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
  "tool.execution.start",
  "tool.execution.update",
  "tool.execution.end",
  "queue.updated",
  "compaction.start",
  "compaction.end",
  "retry.start",
  "retry.end",
  "resync.required",
]

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

function modelValue(model: { provider: string; id: string }) {
  return JSON.stringify([model.provider, model.id])
}

export function SessionRuntime({
  sessionId,
  mutationToken,
  initialStatus,
  initialSnapshot,
}: {
  sessionId: string
  mutationToken: string
  initialStatus: RuntimeStatus
  initialSnapshot: RuntimeSnapshot | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [draft, setDraft] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [compacting, setCompacting] = useState(false)
  const [streamingBehavior, setStreamingBehavior] = useState<
    "steer" | "followUp"
  >("followUp")
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState({ text: "", thinking: "" })
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [queuedMessages, setQueuedMessages] = useState(0)
  const [retrying, setRetrying] = useState<string | null>(null)

  useEffect(() => {
    const events = new EventSource(`/api/v1/events?sessionId=${sessionId}`)
    const handle = (source: Event) => {
      const event = JSON.parse(
        (source as MessageEvent<string>).data
      ) as RuntimeEvent
      if (event.type === "runtime.starting") setStatus("starting")
      if (event.type === "runtime.ready") {
        setStatus("ready")
        setSnapshot(event.payload as RuntimeSnapshot)
      }
      if (event.type === "runtime.busy") setStatus("busy")
      if (event.type === "runtime.idle") setStatus("ready")
      if (event.type === "runtime.stopping") setStatus("stopping")
      if (event.type === "runtime.stopped") {
        setStatus("stopped")
        setSnapshot(null)
      }
      if (event.type === "runtime.crashed") {
        setStatus("crashed")
        setError("Pi worker 意外退出；历史 JSONL 仍可读取。")
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
        setStatus("busy")
      }
      if (event.type === "compaction.end") setCompacting(false)
      if (event.type === "retry.start") {
        setRetrying(retryDescription(event.payload))
      }
      if (event.type === "retry.end") setRetrying(null)
      if (event.type === "resync.required") router.refresh()
    }

    for (const type of EVENT_TYPES) events.addEventListener(type, handle)
    events.onerror = () => {
      setError("实时连接已断开；浏览器正在自动重连。")
    }
    events.onopen = () => setError(null)
    return () => events.close()
  }, [router, sessionId])

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await mutate(`/api/v1/sessions/${sessionId}/messages`, "POST", {
        message,
        images: [],
        streamingBehavior,
      })
      setDraft("")
      setStatus("busy")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSubmitting(false)
    }
  }

  async function abort() {
    setError(null)
    try {
      await mutate(`/api/v1/sessions/${sessionId}/abort`, "POST")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  async function setModel(value: string) {
    const model = snapshot?.availableModels.find(
      (available) => modelValue(available) === value
    )
    if (!model) {
      setError("选择的模型不再可用。")
      return
    }
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

  function selectThinkingLevel(value: string) {
    const level = snapshot?.availableThinkingLevels.find(
      (available) => available === value
    )
    if (!level) {
      setError("选择的 thinking level 不再可用。")
      return
    }
    void setThinkingLevel(level)
  }

  function selectStreamingBehavior(value: string) {
    if (value !== "steer" && value !== "followUp") {
      throw new Error("Pi returned an invalid queue behavior.")
    }
    setStreamingBehavior(value)
  }

  async function compact() {
    setCompacting(true)
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
    } finally {
      setCompacting(false)
    }
  }

  const isBusy = status === "busy"
  const hasStreamingContent = streaming.text || streaming.thinking

  return (
    <div className="sticky bottom-0 z-10 -mx-6 border-t bg-background/95 px-6 py-4 backdrop-blur md:-mx-10 md:px-10">
      <div className="mx-auto grid w-full max-w-4xl gap-3">
        {hasStreamingContent ? (
          <div className="grid gap-2 rounded-xl border bg-background p-4 text-sm">
            {streaming.thinking ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  思考中
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {streaming.thinking}
                </p>
              </details>
            ) : null}
            {streaming.text ? <Markdown>{streaming.text}</Markdown> : null}
          </div>
        ) : null}
        <form
          onSubmit={submit}
          className="rounded-2xl border bg-background p-2 shadow-sm"
        >
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="向 Pi 发送消息"
            aria-label="向 Pi 发送消息"
            className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center gap-2 px-1 pb-1">
            <Badge variant={status === "crashed" ? "destructive" : "secondary"}>
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
              <span className="text-xs text-muted-foreground">{retrying}</span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {isBusy ? (
                <Select
                  value={streamingBehavior}
                  onValueChange={selectStreamingBehavior}
                >
                  <SelectTrigger size="sm" aria-label="消息队列方式">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim() || submitting}
                aria-label="发送"
              >
                {submitting ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <SendIcon />
                )}
              </Button>
            </div>
          </div>
          {snapshot ? (
            <div className="flex flex-wrap items-center gap-2 border-t px-1 pt-2">
              {snapshot.model && snapshot.availableModels.length ? (
                <Select
                  value={modelValue(snapshot.model)}
                  onValueChange={setModel}
                  disabled={isBusy || updating || compacting}
                >
                  <SelectTrigger
                    size="sm"
                    className="max-w-56"
                    aria-label="模型"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.availableModels.map((model) => (
                      <SelectItem
                        key={modelValue(model)}
                        value={modelValue(model)}
                      >
                        {model.provider} / {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {snapshot.availableThinkingLevels.length > 1 ? (
                <Select
                  value={snapshot.thinkingLevel}
                  onValueChange={selectThinkingLevel}
                  disabled={isBusy || updating || compacting}
                >
                  <SelectTrigger size="sm" aria-label="Thinking level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.availableThinkingLevels.map((level) => (
                      <SelectItem key={level} value={level}>
                        Thinking: {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={compact}
                disabled={isBusy || updating || compacting}
              >
                {compacting ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <Minimize2Icon />
                )}
                压缩上下文
              </Button>
            </div>
          ) : null}
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
