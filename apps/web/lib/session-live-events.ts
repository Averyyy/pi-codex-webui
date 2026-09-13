import type {
  SessionStreamStore,
  RuntimeStreamMessage,
} from "./session-stream-store"

export interface SessionLiveEvent {
  id: string
  type: string
  payload: unknown
}

export const STREAM_EVENT_TYPES = [
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
  "tool.execution.start",
  "tool.execution.update",
  "tool.execution.end",
  "compaction.start",
  "session.completed",
  "session.leaf.changed",
  "resync.required",
] as const

const parsedEvents = new WeakMap<Event, SessionLiveEvent>()
export function parseSessionLiveEvent(source: Event): SessionLiveEvent {
  const existing = parsedEvents.get(source)
  if (existing) return existing
  const event = JSON.parse(
    (source as MessageEvent<string>).data
  ) as SessionLiveEvent
  if (!event || typeof event.type !== "string" || typeof event.id !== "string")
    throw new Error("Invalid session event.")
  parsedEvents.set(source, event)
  return event
}

export function applySessionLiveEvent(
  store: SessionStreamStore,
  event: Pick<SessionLiveEvent, "type" | "payload">
) {
  if (event.type === "runtime.starting") store.setRuntimeStatus("starting")
  if (
    event.type === "runtime.ready" ||
    event.type === "runtime.idle" ||
    event.type === "session.completed"
  )
    store.setRuntimeStatus("ready")
  if (event.type === "runtime.busy" || event.type === "compaction.start")
    store.setRuntimeStatus("busy")
  if (event.type === "runtime.stopping") store.setRuntimeStatus("stopping")
  if (event.type === "runtime.stopped") store.setRuntimeStatus("stopped")
  if (event.type === "runtime.crashed") store.setRuntimeStatus("crashed")
  if (event.type.startsWith("session.message.")) {
    const payload = event.payload as { message?: RuntimeStreamMessage }
    const message = payload?.message
    if (!message || typeof message.role !== "string" || !("content" in message))
      throw new Error("Runtime omitted a valid message.")
    if (event.type === "session.message.start") store.startMessage(message)
    else if (event.type === "session.message.update")
      store.updateMessage(message)
    else if (event.type === "session.message.end") store.endMessage(message)
  }
  if (event.type.startsWith("tool.execution.")) {
    const payload = event.payload as {
      toolCallId: string
      toolName: string
      args?: unknown
      partialResult?: unknown
      result?: unknown
      isError?: boolean
    }
    if (
      !payload ||
      typeof payload.toolCallId !== "string" ||
      typeof payload.toolName !== "string"
    )
      throw new Error("Invalid tool event.")
    if (event.type === "tool.execution.start")
      store.startTool({ ...payload, args: payload.args })
    if (event.type === "tool.execution.update")
      store.updateTool({
        ...payload,
        args: payload.args,
        partialResult: payload.partialResult,
      })
    if (event.type === "tool.execution.end") {
      if (typeof payload.isError !== "boolean")
        throw new Error("Runtime omitted the tool outcome.")
      store.endTool({
        ...payload,
        result: payload.result,
        isError: payload.isError,
      })
    }
  }
}

export function compareEventCursors(left: string, right: string) {
  const parse = (value: string) => {
    const match =
      /^event-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d+)$/i.exec(
        value
      )
    if (!match || !Number.isSafeInteger(Number(match[2])))
      throw new Error("Invalid session event cursor.")
    return { epoch: match[1], sequence: Number(match[2]) }
  }
  const a = parse(left),
    b = parse(right)
  return a.epoch === b.epoch ? Math.sign(a.sequence - b.sequence) : null
}
