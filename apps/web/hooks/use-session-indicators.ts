"use client"

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import { z } from "zod"

import { useI18n } from "@/components/i18n-provider"
import { ApiError, validatedResponseJson } from "@/lib/api-response"
import type { SessionSummary } from "@/lib/session-types"
import { dispatchSessionEntityUpdated } from "@/lib/session-catalog-events"
import { SESSION_CATALOG_CHANGED } from "@/lib/session-catalog-events"
import { dispatchModelCatalogInvalidated } from "@/lib/model-catalog-events"
import { dispatchWebUiExtensionCatalogInvalidated } from "@/lib/webui-extension-events"

const sessionEventSchema = z.object({
  type: z.string().min(1),
  sessionId: z.string().optional(),
  payload: z.unknown().optional(),
})
const catalogInvalidationPayloadSchema = z.object({
  kind: z.enum(["data-refresh", "invalidate"]).optional(),
  catalogIdentity: z.string().min(1).optional(),
  catalogVersion: z.string().min(1).optional(),
  reason: z.string().optional(),
  all: z.literal(true).optional(),
  projectId: z.string().nullable().optional(),
})

const readResultSchema = z.object({
  sessionId: z.string().min(1),
  unread: z.literal(false),
})

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
  const { t } = useI18n()
  const sessionKey = useMemo(
    () => sessions.map((session) => session.id).join("\0"),
    [sessions]
  )
  const sessionIdSet = useMemo(
    () => new Set(sessionKey ? sessionKey.split("\0") : []),
    [sessionKey]
  )
  const initialRunningKey = [
    ...initialRunningSessionIds,
    ...sessions
      .filter((session) => session.isRunning)
      .map((session) => session.id),
  ]
    .sort()
    .join("\0")
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
      const result = await validatedResponseJson(
        response,
        readResultSchema.parse,
        t("session.readFailed", { status: response.status })
      )
      if (result.sessionId !== sessionId) {
        throw new ApiError(t("session.readInvalidResponse"))
      }
      dispatchSessionEntityUpdated({ sessionId, hasUnreadCompletion: false })
    },
    [mutationToken, t]
  )

  const readSession = useCallback(
    (sessionId: string) => {
      const existing = readRequests.current.get(sessionId)
      if (existing) return existing

      setUnreadOverrides((current) => setOverride(current, sessionId, false))
      const request: Promise<void> = persistSessionRead(sessionId)
        .catch((error: unknown) => {
          setUnreadOverrides((current) => setOverride(current, sessionId, true))
          dispatchSessionEntityUpdated({
            sessionId,
            hasUnreadCompletion: true,
          })
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
    let event: z.infer<typeof sessionEventSchema>
    try {
      event = sessionEventSchema.parse(
        JSON.parse((source as MessageEvent<string>).data)
      )
    } catch (failure) {
      console.error("Invalid session indicator event.", failure)
      return
    }
    if (event.type === "model.catalog.invalidated") {
      const payload = catalogInvalidationPayloadSchema.parse(
        event.payload ?? {}
      )
      if (payload.all) {
        dispatchModelCatalogInvalidated({ all: true, reason: payload.reason })
      } else if (payload.catalogIdentity) {
        dispatchModelCatalogInvalidated({
          kind: payload.kind,
          catalogIdentity: payload.catalogIdentity,
          catalogVersion: payload.catalogVersion,
          reason: payload.reason,
        })
      }
      return
    }
    if (event.type === "webui.extension.catalog.invalidated") {
      const payload = catalogInvalidationPayloadSchema.parse(
        event.payload ?? {}
      )
      if (payload.projectId !== undefined || payload.all) {
        dispatchWebUiExtensionCatalogInvalidated({
          kind: payload.kind ?? "invalidate",
          projectId: payload.all ? null : (payload.projectId ?? null),
          ...(payload.catalogIdentity
            ? { catalogIdentity: payload.catalogIdentity }
            : {}),
          ...(payload.catalogVersion
            ? { catalogVersion: payload.catalogVersion }
            : {}),
        })
      }
      return
    }
    if (event.type === "resync.required") {
      setRunningOverrides(new Map())
      setUnreadOverrides(new Map())
      window.dispatchEvent(new Event(SESSION_CATALOG_CHANGED))
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
      dispatchSessionEntityUpdated({
        sessionId,
        hasUnreadCompletion: true,
      })
    }
  })

  useEffect(() => {
    if (!activeSessionId) return
    void readSession(activeSessionId)
  }, [activeSessionId, readSession])

  useEffect(() => {
    const events = new EventSource("/api/v1/events?scope=all")
    const eventTypes = [
      ...RUNNING_EVENT_TYPES,
      ...STOPPED_EVENT_TYPES,
      "session.completed",
      "resync.required",
      "model.catalog.invalidated",
      "webui.extension.catalog.invalidated",
    ]
    for (const eventType of eventTypes) {
      events.addEventListener(eventType, handleSessionEvent)
    }
    return () => events.close()
  }, [])

  return { runningSessionIds, unreadSessionIds }
}
