"use client"

import {
  createContext,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  webUiViewEventSchema,
  webUiViewSnapshotsSchema,
  type WebUiViewSnapshot,
} from "@workspace/runtime-protocol"

import type { WebUiExtensionCatalogView } from "@/lib/webui-extensions/types"

interface SessionExtensionContextValue {
  sessionId: string
  mutationToken: string
  catalog: WebUiExtensionCatalogView
  views: WebUiViewSnapshot[]
  invoke(
    view: Pick<WebUiViewSnapshot, "extensionId" | "instanceId">,
    actionId: string,
    input?: unknown
  ): Promise<unknown>
  report(
    view: Pick<WebUiViewSnapshot, "extensionId" | "instanceId">,
    status: "ready" | "error" | "disposed",
    message?: string
  ): Promise<void>
}

interface RuntimeEvent {
  type: string
  payload: unknown
}

export const SessionExtensionContext =
  createContext<SessionExtensionContextValue | null>(null)

export function SessionExtensionProvider({
  sessionId,
  projectId,
  mutationToken,
  initialCatalog,
  children,
}: {
  sessionId: string
  projectId: string
  mutationToken: string
  initialCatalog: WebUiExtensionCatalogView
  children: ReactNode
}) {
  const [catalog, setCatalog] = useState(initialCatalog)
  const [views, setViews] = useState<Record<string, WebUiViewSnapshot>>({})
  const closedViews = useRef(new Set<string>())

  const invoke = useCallback(
    async (
      view: Pick<WebUiViewSnapshot, "extensionId" | "instanceId">,
      actionId: string,
      input?: unknown
    ) => {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/webui-extensions/${view.extensionId}/actions/${encodeURIComponent(actionId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({ instanceId: view.instanceId, input }),
        }
      )
      const result = (await response.json()) as {
        result?: unknown
        error?: string
      }
      if (!response.ok) {
        throw new Error(result.error ?? "WebUI extension action failed.")
      }
      return result.result
    },
    [mutationToken, sessionId]
  )

  const report = useCallback(
    async (
      view: Pick<WebUiViewSnapshot, "extensionId" | "instanceId">,
      status: "ready" | "error" | "disposed",
      message?: string
    ) => {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/webui-extensions/${view.extensionId}/client-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({
            instanceId: view.instanceId,
            status,
            message,
          }),
        }
      )
      if (!response.ok && !(status === "disposed" && response.status === 409)) {
        throw new Error(`WebUI client status failed (HTTP ${response.status}).`)
      }
    },
    [mutationToken, sessionId]
  )

  const loadViews = useEffectEvent(async () => {
    const response = await fetch(`/api/v1/sessions/${sessionId}/webui-views`, {
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(`WebUI views sync failed (HTTP ${response.status}).`)
    }
    const snapshots = webUiViewSnapshotsSchema.parse(await response.json())
    setViews((current) => {
      const next = { ...current }
      for (const snapshot of snapshots) {
        if (closedViews.current.has(snapshot.instanceId)) continue
        const existing = current[snapshot.instanceId]
        if (!existing || snapshot.revision >= existing.revision) {
          next[snapshot.instanceId] = snapshot
        }
      }
      return next
    })
  })

  const loadCatalog = useEffectEvent(async () => {
    const response = await fetch(
      `/api/v1/webui-extensions?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" }
    )
    if (!response.ok) {
      throw new Error(
        `WebUI extension catalog failed (HTTP ${response.status}).`
      )
    }
    setCatalog((await response.json()) as WebUiExtensionCatalogView)
  })

  useEffect(() => {
    const events = new EventSource(`/api/v1/events?sessionId=${sessionId}`)
    const handle = (source: Event) => {
      const event = JSON.parse(
        (source as MessageEvent<string>).data
      ) as RuntimeEvent
      if (event.type === "webui.view") {
        const viewEvent = webUiViewEventSchema.parse(event.payload)
        if (viewEvent.kind === "close") {
          closedViews.current.add(viewEvent.instanceId)
          setViews((current) => {
            const next = { ...current }
            delete next[viewEvent.instanceId]
            return next
          })
        } else {
          const view = viewEvent.view
          closedViews.current.delete(view.instanceId)
          setViews((current) => {
            const existing = current[view.instanceId]
            return existing && existing.revision > view.revision
              ? current
              : { ...current, [view.instanceId]: view }
          })
        }
      }
      if (event.type === "runtime.starting") {
        closedViews.current.clear()
        setViews({})
      }
      if (
        event.type === "runtime.stopped" ||
        event.type === "runtime.crashed"
      ) {
        setViews({})
      }
      if (event.type === "runtime.ready" || event.type === "resync.required") {
        void Promise.all([loadViews(), loadCatalog()]).catch(console.error)
      }
    }
    for (const type of [
      "webui.view",
      "runtime.starting",
      "runtime.ready",
      "runtime.stopped",
      "runtime.crashed",
      "resync.required",
    ]) {
      events.addEventListener(type, handle)
    }
    void loadViews().catch(console.error)
    return () => events.close()
  }, [sessionId])

  const value = useMemo(
    () => ({
      sessionId,
      mutationToken,
      catalog,
      views: Object.values(views),
      invoke,
      report,
    }),
    [catalog, invoke, mutationToken, report, sessionId, views]
  )

  return (
    <SessionExtensionContext value={value}>{children}</SessionExtensionContext>
  )
}
