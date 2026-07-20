import {
  normalizeToolResult,
  normalizeTranscriptParts,
  type ToolResultView,
} from "@/lib/message-content"
import type { TranscriptPart } from "@/lib/session-types"

export interface RuntimeStreamMessage {
  role: string
  content: unknown
  toolCallId?: string
  toolName?: string
  details?: unknown
  isError?: boolean
  errorMessage?: string
  display?: boolean
}

export interface StreamingMessageView {
  id: number
  role: string
  parts: TranscriptPart[]
  complete: boolean
  errorMessage?: string
}

export interface StreamingToolView {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: "running" | "complete" | "error"
  result?: ToolResultView
}

export interface ActiveStreamingTool {
  id: string
  name: string
}

interface SessionStreamingSnapshot {
  messages: StreamingMessageView[]
  tools: ReadonlyMap<string, StreamingToolView>
  activeTools: ActiveStreamingTool[]
  followRequest: number
}

export interface FrameScheduler {
  request(callback: () => void): number
  cancel(handle: number): void
}

const EMPTY_MESSAGES: StreamingMessageView[] = []
const EMPTY_ACTIVE_TOOLS: ActiveStreamingTool[] = []
const EMPTY_TOOLS: ReadonlyMap<string, StreamingToolView> = new Map()

function emptySnapshot(): SessionStreamingSnapshot {
  return {
    messages: EMPTY_MESSAGES,
    tools: EMPTY_TOOLS,
    activeTools: EMPTY_ACTIVE_TOOLS,
    followRequest: 0,
  }
}

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
}

function activeTools(
  tools: ReadonlyMap<string, StreamingToolView>,
  current: ActiveStreamingTool[]
) {
  const next = Array.from(tools.values())
    .filter((tool) => tool.status === "running")
    .map(({ id, name }) => ({ id, name }))
  return next.length === current.length &&
    next.every(
      (tool, index) =>
        tool.id === current[index]?.id && tool.name === current[index]?.name
    )
    ? current
    : next
}

function toolArguments(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Runtime emitted invalid tool arguments.")
  }
  return value as Record<string, unknown>
}

export class SessionStreamStore {
  private committed = emptySnapshot()
  private pending = this.committed
  private readonly listeners = new Set<() => void>()
  private readonly activeMessageIds = new Map<string, number>()
  private nextMessageId = 0
  private frame: number | null = null

  constructor(private readonly scheduler = browserFrameScheduler) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getMessages = () => this.committed.messages
  getActiveTools = () => this.committed.activeTools
  getFollowRequest = () => this.committed.followRequest
  getTool = (toolCallId: string) => this.committed.tools.get(toolCallId) ?? null

  requestFollow = () => {
    this.stage({
      ...this.pending,
      followRequest: this.pending.followRequest + 1,
    })
  }

  startMessage = (message: RuntimeStreamMessage) => {
    if (message.role === "toolResult") {
      this.setToolResultMessage(message)
      return
    }
    if (message.role === "custom" && message.display === false) return
    if (this.activeMessageIds.has(message.role)) {
      throw new Error(`Runtime started overlapping ${message.role} messages.`)
    }
    this.appendMessage(message, false)
  }

  updateMessage = (message: RuntimeStreamMessage) => {
    if (message.role === "toolResult") {
      this.setToolResultMessage(message)
      return
    }
    if (message.role === "custom" && message.display === false) return
    this.replaceMessage(message, false)
  }

  endMessage = (message: RuntimeStreamMessage) => {
    if (message.role === "toolResult") {
      this.setToolResultMessage(message)
      return
    }
    if (message.role === "custom" && message.display === false) return
    this.replaceMessage(message, true)
  }

  startTool = (payload: {
    toolCallId: string
    toolName: string
    args: unknown
  }) => {
    this.setTool(payload, "running")
  }

  updateTool = (payload: {
    toolCallId: string
    toolName: string
    args: unknown
    partialResult: unknown
  }) => {
    this.setTool(payload, "running", normalizeToolResult(payload.partialResult))
  }

  endTool = (payload: {
    toolCallId: string
    toolName: string
    result: unknown
    isError: boolean
  }) => {
    const existing = this.pending.tools.get(payload.toolCallId)
    const call = this.findToolCall(payload.toolCallId)
    this.setTool(
      {
        ...payload,
        args: existing?.arguments ?? call?.arguments ?? {},
      },
      payload.isError ? "error" : "complete",
      normalizeToolResult(payload.result, payload.isError)
    )
  }

  clear = (synchronous = false) => {
    this.activeMessageIds.clear()
    this.pending = emptySnapshot()
    if (synchronous) this.commit()
    else this.schedule()
  }

  dispose = () => {
    if (this.frame !== null) this.scheduler.cancel(this.frame)
    this.frame = null
    this.listeners.clear()
  }

  private appendMessage(message: RuntimeStreamMessage, complete: boolean) {
    const id = ++this.nextMessageId
    if (!complete) this.activeMessageIds.set(message.role, id)
    this.stage({
      ...this.pending,
      messages: [
        ...this.pending.messages,
        {
          id,
          role: message.role,
          parts: normalizeTranscriptParts(message.content),
          complete,
          ...(message.errorMessage
            ? { errorMessage: message.errorMessage }
            : {}),
        },
      ],
    })
  }

  private replaceMessage(message: RuntimeStreamMessage, complete: boolean) {
    const id = this.activeMessageIds.get(message.role)
    if (id === undefined) {
      this.appendMessage(message, complete)
      return
    }
    if (complete) this.activeMessageIds.delete(message.role)
    this.stage({
      ...this.pending,
      messages: this.pending.messages.map((current) =>
        current.id === id
          ? {
              ...current,
              parts: normalizeTranscriptParts(message.content),
              complete,
              ...(message.errorMessage
                ? { errorMessage: message.errorMessage }
                : {}),
            }
          : current
      ),
    })
  }

  private setToolResultMessage(message: RuntimeStreamMessage) {
    if (!message.toolCallId) {
      throw new Error("Runtime emitted a tool result without a tool call ID.")
    }
    const tools = new Map(this.pending.tools)
    const existing = tools.get(message.toolCallId)
    const call = this.findToolCall(message.toolCallId)
    tools.set(message.toolCallId, {
      id: message.toolCallId,
      name: existing?.name ?? message.toolName ?? call?.name ?? "",
      arguments: existing?.arguments ?? call?.arguments ?? {},
      status: message.isError ? "error" : "complete",
      result: {
        parts: normalizeTranscriptParts(message.content),
        details: message.details,
        isError: message.isError,
      },
    })
    this.stage({
      ...this.pending,
      tools,
      activeTools: activeTools(tools, this.pending.activeTools),
    })
  }

  private setTool(
    payload: { toolCallId: string; toolName: string; args: unknown },
    status: StreamingToolView["status"],
    result?: ToolResultView
  ) {
    const arguments_ = toolArguments(payload.args)
    const tools = new Map(this.pending.tools)
    tools.set(payload.toolCallId, {
      id: payload.toolCallId,
      name: payload.toolName,
      arguments: arguments_,
      status,
      ...(result ? { result } : {}),
    })
    const messages = this.withToolCall({
      type: "toolCall",
      id: payload.toolCallId,
      name: payload.toolName,
      arguments: arguments_,
    })
    this.stage({
      ...this.pending,
      messages,
      tools,
      activeTools: activeTools(tools, this.pending.activeTools),
    })
  }

  private withToolCall(part: Extract<TranscriptPart, { type: "toolCall" }>) {
    let found = false
    const messages = this.pending.messages.map((message) => {
      const index = message.parts.findIndex(
        (candidate) => candidate.type === "toolCall" && candidate.id === part.id
      )
      if (index === -1) return message
      found = true
      const parts = [...message.parts]
      parts[index] = part
      return { ...message, parts }
    })
    if (found) return messages

    return [
      ...messages,
      {
        id: ++this.nextMessageId,
        role: "assistant",
        parts: [part],
        complete: true,
      },
    ]
  }

  private findToolCall(toolCallId: string) {
    for (let index = this.pending.messages.length - 1; index >= 0; index -= 1) {
      const part = this.pending.messages[index]?.parts.find(
        (candidate) =>
          candidate.type === "toolCall" && candidate.id === toolCallId
      )
      if (part?.type === "toolCall") return part
    }
    return undefined
  }

  private stage(snapshot: SessionStreamingSnapshot) {
    this.pending = snapshot
    this.schedule()
  }

  private schedule() {
    if (this.frame !== null) return
    this.frame = this.scheduler.request(() => {
      this.frame = null
      this.commit()
    })
  }

  private commit() {
    if (this.frame !== null) this.scheduler.cancel(this.frame)
    this.frame = null
    if (this.committed === this.pending) return
    this.committed = this.pending
    for (const listener of this.listeners) listener()
  }
}

export const EMPTY_STREAMING_MESSAGES = EMPTY_MESSAGES
export const EMPTY_STREAMING_ACTIVE_TOOLS = EMPTY_ACTIVE_TOOLS
