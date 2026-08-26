"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import {
  EMPTY_STREAMING_ACTIVE_TOOLS,
  EMPTY_STREAMING_MESSAGES,
  SessionStreamStore,
} from "@/lib/session-stream-store"
import { SessionEventStream } from "@/lib/session-event-stream"
import type { RuntimeStatus } from "@workspace/runtime-protocol"

interface SessionStreamingContextValue {
  events: SessionEventStream
  store: SessionStreamStore
}

const SessionStreamingContext =
  createContext<SessionStreamingContextValue | null>(null)

interface CachedSessionStreamingValue {
  events: SessionEventStream
  store: SessionStreamStore
}

const cachedSessions = new Map<string, CachedSessionStreamingValue>()

function cachedSession(sessionId: string, initialEventCursor: string) {
  const existing = cachedSessions.get(sessionId)
  if (existing) return existing
  const value = {
    events: new SessionEventStream(
      sessionId,
      initialEventCursor,
      undefined,
      true
    ),
    store: new SessionStreamStore(),
  }
  cachedSessions.set(sessionId, value)
  return value
}

export function SessionStreamingProvider({
  sessionId,
  initialEventCursor,
  initialStatus,
  children,
}: {
  sessionId: string
  initialEventCursor: string
  initialStatus: RuntimeStatus
  children: ReactNode
}) {
  const [value] = useState(() => cachedSession(sessionId, initialEventCursor))

  useEffect(() => {
    value.events.open()
    return () => {
      if (value.store.getRuntimeStatus() === "busy") return
      value.events.close()
      value.store.dispose()
      if (cachedSessions.get(sessionId) === value)
        cachedSessions.delete(sessionId)
    }
  }, [sessionId, value])

  useEffect(() => {
    value.store.setRuntimeStatus(initialStatus)
    if (initialStatus !== "busy") {
      value.events.clearPending()
      value.store.clear(true)
    }
  }, [initialStatus, value])

  return (
    <SessionStreamingContext value={value}>{children}</SessionStreamingContext>
  )
}

function useSessionStreamingContext() {
  const value = useContext(SessionStreamingContext)
  if (!value) {
    throw new Error("Session streaming requires SessionStreamingProvider.")
  }
  return value
}

export function useSessionStreaming() {
  return useSessionStreamingContext().store
}

export function useSessionEvents() {
  return useSessionStreamingContext().events
}

export function useStreamingMessages() {
  const store = useSessionStreaming()
  return useSyncExternalStore(
    store.subscribe,
    store.getMessages,
    () => EMPTY_STREAMING_MESSAGES
  )
}

export function useStreamingActiveTools() {
  const store = useSessionStreaming()
  return useSyncExternalStore(
    store.subscribe,
    store.getActiveTools,
    () => EMPTY_STREAMING_ACTIVE_TOOLS
  )
}

export function useStreamingFollowRequest() {
  const store = useSessionStreaming()
  return useSyncExternalStore(store.subscribe, store.getFollowRequest, () => 0)
}

export function useStreamingRuntimeStatus() {
  const store = useSessionStreaming()
  return useSyncExternalStore(
    store.subscribe,
    store.getRuntimeStatus,
    () => null
  )
}

export function useStreamingTool(toolCallId: string) {
  const store = useSessionStreaming()
  const getTool = useCallback(
    () => store.getTool(toolCallId),
    [store, toolCallId]
  )
  return useSyncExternalStore(store.subscribe, getTool, () => null)
}
