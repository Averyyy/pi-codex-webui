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

interface SessionStreamingContextValue {
  events: SessionEventStream
  store: SessionStreamStore
}

const SessionStreamingContext =
  createContext<SessionStreamingContextValue | null>(null)

export function SessionStreamingProvider({
  sessionId,
  initialEventCursor,
  children,
}: {
  sessionId: string
  initialEventCursor: string
  children: ReactNode
}) {
  const [value] = useState(() => ({
    events: new SessionEventStream(sessionId, initialEventCursor),
    store: new SessionStreamStore(),
  }))

  useEffect(() => {
    value.events.open()
    return () => {
      value.events.close()
      value.store.dispose()
    }
  }, [value])

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
