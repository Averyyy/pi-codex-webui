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

function acquire(sessionId: string, view: SessionView) {
  if (typeof window === "undefined")
    return new SessionViewController(sessionId, view)
  const previous = cachedSessions.get(sessionId)
  if (previous) return previous
  const controller = new SessionViewController(sessionId, view)
  cachedSessions.set(sessionId, controller)
  const idle = [...cachedSessions.values()]
    .filter(
      (entry) =>
        entry.lastUsed > 0 &&
        !entry.users &&
        !entry.active() &&
        entry !== controller
    )
    .sort((a, b) => a.lastUsed - b.lastUsed)
  while (cachedSessions.size > 8 && idle.length) {
    const oldest = idle.shift()!
    oldest.dispose()
    cachedSessions.delete(oldest.sessionId)
  }
  return controller
}

export function SessionStreamingProvider({
  sessionId,
  initialView,
  children,
}: {
  sessionId: string
  initialView: SessionView
  children: ReactNode
}) {
  const [controller] = useState(() => acquire(sessionId, initialView))
  useEffect(() => {
    controller.retain()
    return () => controller.release()
  }, [controller])
  useEffect(() => {
    controller.acceptInitial(initialView)
  }, [controller, initialView])
  return <Context value={controller}>{children}</Context>
}

export function useSessionViewController() {
  const value = useContext(Context)
  if (!value) throw new Error("Session view requires SessionStreamingProvider.")
  return value
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

export function useSessionTranscript(fallback: SessionSnapshot) {
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
    () => controller.initialView.live.messages
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
    () => controller.initialView.runtime.status
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
