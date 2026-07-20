"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { SessionSummary } from "@/lib/session-types"

interface SessionEvent {
  type: string
  sessionId?: string
}

const RUNNING_EVENT_TYPES = new Set(["runtime.busy", "compaction.start"])
const STOPPED_EVENT_TYPES = new Set([
  "runtime.idle",
  "runtime.stopping",
  "runtime.stopped",
  "runtime.crashed",
])

function setOverride(
  current: Map<string, boolean>,
  id: string,
  value: boolean
) {
  if (current.get(id) === value) return current
  const next = new Map(current)
  next.set(id, value)
  return next
}

export function useSessionIndicators({
  sessions,
  activeSessionId,
  initialRunningSessionIds,
  mutationToken,
}: {
  sessions: SessionSummary[]
  activeSessionId: string | null
  initialRunningSessionIds: string[]
  mutationToken: string
}) {
  const router = useRouter()
  const sessionKey = useMemo(
    () => sessions.map((session) => session.id).join("\0"),
    [sessions]
  )
  const sessionIdSet = useMemo(
    () => new Set(sessionKey ? sessionKey.split("\0") : []),
    [sessionKey]
  )
  const hasSessions = sessionIdSet.size > 0
  const initialRunningKey = [...initialRunningSessionIds].sort().join("\0")
  const initialUnreadKey = useMemo(
    () =>
      sessions
        .filter((session) => session.hasUnreadCompletion)
        .map((session) => session.id)
        .sort()
        .join("\0"),
    [sessions]
  )
  const initialRunningSessionIdSet = useMemo(
    () => new Set(initialRunningKey ? initialRunningKey.split("\0") : []),
    [initialRunningKey]
  )
  const initialUnreadSessionIdSet = useMemo(
    () => new Set(initialUnreadKey ? initialUnreadKey.split("\0") : []),
    [initialUnreadKey]
  )
  const [runningOverrides, setRunningOverrides] = useState(
    () => new Map<string, boolean>()
  )
  const [unreadOverrides, setUnreadOverrides] = useState(
    () => new Map<string, boolean>()
  )
  const readRequests = useRef(new Map<string, Promise<void>>())
  const runningSessionIds = useMemo(
    () =>
      new Set(
        sessions
          .filter(
            (session) =>
              runningOverrides.get(session.id) ??
              initialRunningSessionIdSet.has(session.id)
          )
          .map((session) => session.id)
      ),
    [initialRunningSessionIdSet, runningOverrides, sessions]
  )
  const unreadSessionIds = useMemo(
    () =>
      new Set(
        sessions
          .filter(
            (session) =>
              unreadOverrides.get(session.id) ??
              initialUnreadSessionIdSet.has(session.id)
          )
          .map((session) => session.id)
      ),
    [initialUnreadSessionIdSet, sessions, unreadOverrides]
  )

  const persistSessionRead = useCallback(
    async (sessionId: string) => {
      const response = await fetch(
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/read`,
        {
          method: "POST",
          headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
        }
      )
      if (!response.ok) {
        const body = (await response.json()) as { error?: string }
        throw new Error(body.error ?? `操作失败（HTTP ${response.status}）。`)
      }
    },
    [mutationToken]
  )

  const readSession = useCallback(
    (sessionId: string) => {
      const existing = readRequests.current.get(sessionId)
      if (existing) return existing

      setUnreadOverrides((current) => setOverride(current, sessionId, false))
      const request: Promise<void> = persistSessionRead(sessionId)
        .catch((error: unknown) => {
          setUnreadOverrides((current) => setOverride(current, sessionId, true))
          toast.error(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          if (readRequests.current.get(sessionId) === request) {
            readRequests.current.delete(sessionId)
          }
        })
      readRequests.current.set(sessionId, request)
      return request
    },
    [persistSessionRead]
  )

  const handleSessionEvent = useEffectEvent((source: Event) => {
    const event = JSON.parse(
      (source as MessageEvent<string>).data
    ) as SessionEvent
    if (event.type === "resync.required") {
      setRunningOverrides(new Map())
      setUnreadOverrides(new Map())
      router.refresh()
      return
    }
    if (!event.sessionId) return
    const sessionId = event.sessionId
    if (!sessionIdSet.has(sessionId)) return

    if (RUNNING_EVENT_TYPES.has(event.type)) {
      setRunningOverrides((current) => setOverride(current, sessionId, true))
    } else if (STOPPED_EVENT_TYPES.has(event.type)) {
      setRunningOverrides((current) => setOverride(current, sessionId, false))
    }

    if (event.type !== "session.completed") return
    if (sessionId === activeSessionId) {
      void readSession(sessionId)
    } else {
      setUnreadOverrides((current) => setOverride(current, sessionId, true))
    }
  })

  useEffect(() => {
    if (!activeSessionId) return
    void readSession(activeSessionId)
  }, [activeSessionId, readSession])

  useEffect(() => {
    if (!hasSessions) return
    const events = new EventSource("/api/v1/events?scope=all")
    const eventTypes = [
      ...RUNNING_EVENT_TYPES,
      ...STOPPED_EVENT_TYPES,
      "session.completed",
      "resync.required",
    ]
    for (const eventType of eventTypes) {
      events.addEventListener(eventType, handleSessionEvent)
    }
    return () => events.close()
  }, [hasSessions])

  return { runningSessionIds, unreadSessionIds }
}
