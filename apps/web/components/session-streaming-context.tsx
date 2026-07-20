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

const SessionStreamingContext = createContext<SessionStreamStore | null>(null)

export function SessionStreamingProvider({
  children,
}: {
  children: ReactNode
}) {
  const [store] = useState(() => new SessionStreamStore())

  useEffect(() => () => store.dispose(), [store])

  return (
    <SessionStreamingContext value={store}>{children}</SessionStreamingContext>
  )
}

export function useSessionStreaming() {
  const store = useContext(SessionStreamingContext)
  if (!store) {
    throw new Error("Session streaming requires SessionStreamingProvider.")
  }
  return store
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
