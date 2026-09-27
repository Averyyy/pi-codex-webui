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
import { SessionViewController } from "@/lib/session-view-controller"
import type { SessionView } from "@/lib/session-view-types"
import type { SessionSnapshot } from "@/lib/session-types"

const Context = createContext<SessionViewController | null>(null)
const cachedSessions = new Map<string, SessionViewController>()
const EMPTY_METADATA = { loadingEarlier: false, error: null as string | null }
const EMPTY_MESSAGES: ReturnType<
  SessionViewController["store"]["getMessages"]
> = []

function acquire(
  cacheKey: string,
  sessionId: string,
  view: SessionView | null
) {
  if (typeof window === "undefined")
    return new SessionViewController(sessionId, view)
  const previous = cachedSessions.get(cacheKey)
  if (previous) return previous
  const controller = new SessionViewController(sessionId, view)
  cachedSessions.set(cacheKey, controller)
  const idle = [...cachedSessions.values()]
    .filter(
      (entry) => entry.lastUsed > 0 && !entry.users && entry !== controller
    )
    .sort((a, b) => a.lastUsed - b.lastUsed)
  while (cachedSessions.size > 8 && idle.length) {
    const oldest = idle.shift()!
    oldest.dispose()
    for (const [key, value] of cachedSessions) {
      if (value === oldest) {
        cachedSessions.delete(key)
        break
      }
    }
  }
  return controller
}

export function SessionStreamingProvider({
  sessionId,
  identityKey,
  selectedNativeFileRevision,
  initialView,
  children,
}: {
  sessionId: string
  identityKey?: string
  selectedNativeFileRevision?: string
  initialView?: SessionView | null
  children: ReactNode
}) {
  const cacheKey = identityKey ?? sessionId
  const [controller] = useState(() =>
    acquire(cacheKey, sessionId, initialView ?? null)
  )
  useEffect(() => {
    controller.retain(undefined, selectedNativeFileRevision)
    return () => controller.release()
  }, [controller, selectedNativeFileRevision])
  useEffect(() => {
    if (initialView) controller.acceptInitial(initialView)
  }, [controller, initialView])
  return <Context value={controller}>{children}</Context>
}

export function useSessionViewController() {
  const value = useContext(Context)
  if (!value) throw new Error("Session view requires SessionStreamingProvider.")
  return value
}
export function useSessionView() {
  const controller = useSessionViewController()
  return useSyncExternalStore(
    controller.subscribe,
    controller.getView,
    () => null
  )
}
export function useSessionStreaming() {
  return useSessionViewController().store
}
export function useStreamingSessionId() {
  return useSessionViewController().sessionId
}
export function useSessionEvents() {
  return useSessionViewController().events
}

export function useSessionTranscript(fallback: SessionSnapshot): SessionSnapshot
export function useSessionTranscript(fallback: null): SessionSnapshot | null
export function useSessionTranscript(
  fallback: SessionSnapshot | null
): SessionSnapshot | null
export function useSessionTranscript(
  fallback: SessionSnapshot | null
): SessionSnapshot | null {
  const controller = useSessionViewController()
  return (
    useSyncExternalStore(
      controller.store.subscribe,
      controller.store.getTranscript,
      () => fallback
    ) ?? fallback
  )
}
export function useSessionHistoryMetadata() {
  const controller = useSessionViewController()
  return useSyncExternalStore(
    controller.subscribe,
    controller.getMetadata,
    () => EMPTY_METADATA
  )
}
export function useStreamingMessages() {
  const controller = useSessionViewController()
  return useSyncExternalStore(
    controller.store.subscribe,
    controller.store.getMessages,
    () => controller.initialView?.live.messages ?? EMPTY_MESSAGES
  )
}
export function useStreamingActiveTools() {
  const controller = useSessionViewController()
  return useSyncExternalStore(
    controller.store.subscribe,
    controller.store.getActiveTools,
    () => controller.store.getActiveTools()
  )
}
export function useStreamingFollowRequest() {
  const store = useSessionStreaming()
  return useSyncExternalStore(store.subscribe, store.getFollowRequest, () => 0)
}
export function useStreamingRuntimeStatus() {
  const controller = useSessionViewController()
  return useSyncExternalStore(
    controller.store.subscribe,
    controller.store.getRuntimeStatus,
    () => controller.initialView?.runtime.status ?? null
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
