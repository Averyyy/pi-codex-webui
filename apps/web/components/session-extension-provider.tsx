"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { z } from "zod"
import {
  webUiViewEventSchema,
  webUiViewSnapshotsSchema,
  type WebUiPlacement,
  type WebUiViewSnapshot,
} from "@workspace/runtime-protocol"

import { useI18n } from "@/components/i18n-provider"
import {
  useSessionEvents,
  useSessionViewController,
} from "@/components/session-streaming-context"
import {
  WEBUI_EXTENSION_CATALOG_UPDATED,
  type WebUiExtensionCatalogUpdatedDetail,
  webUiExtensionCatalogSecurityEpoch,
} from "@/lib/webui-extension-events"
import {
  EMPTY_SESSION_EXTENSION_STATE,
  loadSessionExtensionViewsAfterCheckpoint,
  sessionExtensionStoreKey,
  type SessionExtensionKey,
  type SessionExtensionPublicState,
  type SessionExtensionStore,
} from "@/lib/session-extension-store"
import { useSessionExtensionStore } from "@/components/session-extension-store-provider"
import { parseWebUiExtensionCatalog } from "@/lib/webui-extensions/catalog-schema"
import { isExtensionCandidateAvailable } from "@/lib/webui-extensions/authorization"
import type {
  WebUiExtensionCandidateView,
  WebUiExtensionCatalogView,
} from "@/lib/webui-extensions/types"

interface RuntimeEvent {
  type: string
  payload: unknown
}

interface SessionExtensionContextValue {
  store: SessionExtensionStore
  key: SessionExtensionKey
  sessionId: string
  projectId: string | null
  identityKey: string
  mutationToken: string
  authorized: boolean
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

const SessionExtensionContext =
  createContext<SessionExtensionContextValue | null>(null)
const EMPTY_VIEW_IDS: readonly string[] = Object.freeze([])
const EMPTY_REPLACEMENT_KEYS: ReadonlySet<string> = new Set()

function matchingCandidate(
  catalog: WebUiExtensionCatalogView | null,
  adapterKey: string
): WebUiExtensionCandidateView | null {
  if (!catalog) return null
  return (
    catalog.groups
      .flatMap((group) => group.candidates)
      .find((candidate) => candidate.key === adapterKey) ?? null
  )
}

export function useSessionExtensionRuntime() {
  const value = useContext(SessionExtensionContext)
  if (!value) {
    throw new Error(
      "Session extension consumers require SessionExtensionProvider."
    )
  }
  return value
}

export function useSessionExtensionState(): SessionExtensionPublicState {
  const { store, key } = useSessionExtensionRuntime()
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeState(key, listener),
    [key, store]
  )
  const getSnapshot = useCallback(() => store.getState(key), [key, store])
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_SESSION_EXTENSION_STATE
  )
}

export function useSessionExtensionViewIds(
  placement: WebUiPlacement,
  excludeViewIds: readonly string[] = []
) {
  const { store, key } = useSessionExtensionRuntime()
  const subscribe = useCallback(
    (listener: () => void) =>
      store.subscribePlacement(key, placement, listener),
    [key, placement, store]
  )
  const getSnapshot = useCallback(
    () => store.getViewIds(key, placement),
    [key, placement, store]
  )
  const viewIds = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_VIEW_IDS
  )
  const excludeKey = JSON.stringify(excludeViewIds)
  const excluded = useMemo(
    () => new Set(JSON.parse(excludeKey) as string[]),
    [excludeKey]
  )
  return useMemo(() => {
    if (excluded.size === 0) return viewIds
    return viewIds.filter((viewId) => !excluded.has(viewId))
  }, [excluded, viewIds])
}

export function useSessionExtensionView(instanceId: string) {
  const { store, key } = useSessionExtensionRuntime()
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeView(key, instanceId, listener),
    [instanceId, key, store]
  )
  const getSnapshot = useCallback(
    () => store.getView(key, instanceId),
    [instanceId, key, store]
  )
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

export function useSessionExtensionViewById(viewId: string) {
  const { store, key } = useSessionExtensionRuntime()
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeViewId(key, viewId, listener),
    [key, store, viewId]
  )
  const getSnapshot = useCallback(
    () => store.getViewById(key, viewId),
    [key, store, viewId]
  )
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

export function useSessionExtensionReplacementKeys() {
  const { store, key } = useSessionExtensionRuntime()
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeReplacementKeys(key, listener),
    [key, store]
  )
  const getSnapshot = useCallback(
    () => store.getReplacementKeys(key),
    [key, store]
  )
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_REPLACEMENT_KEYS
  )
}

export function useSessionExtensionHasReplacementEntry(entryId: string) {
  const { store, key } = useSessionExtensionRuntime()
  const subscribe = useCallback(
    (listener: () => void) =>
      store.subscribeReplacementEntry(key, entryId, listener),
    [entryId, key, store]
  )
  const getSnapshot = useCallback(
    () => store.hasReplacementEntry(key, entryId),
    [entryId, key, store]
  )
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export function SessionExtensionProvider({
  sessionId,
  projectId,
  identityKey,
  mutationToken,
  initialCatalog,
  initialViews,
  authorized,
  children,
}: {
  sessionId: string
  projectId: string | null
  identityKey: string
  mutationToken: string
  initialCatalog: WebUiExtensionCatalogView | null
  initialViews: WebUiViewSnapshot[] | null
  authorized: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  const sessionEvents = useSessionEvents()
  const sessionController = useSessionViewController()
  const store = useSessionExtensionStore()
  const key = useMemo(
    () => sessionExtensionStoreKey(sessionId, identityKey),
    [identityKey, sessionId]
  )

  const fetchCatalog = useEffectEvent(async () => {
    const params = new URLSearchParams()
    if (projectId === null) params.set("scope", "global")
    else params.set("projectId", projectId)
    params.set("sessionId", sessionId)
    const response = await fetch(`/api/v1/webui-extensions?${params}`, {
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(
        t("session.extension.catalogSyncFailed", { status: response.status })
      )
    }
    const catalog = parseWebUiExtensionCatalog(await response.json())
    if (catalog.projectId !== projectId) {
      throw new Error("The extension catalog target changed while loading.")
    }
    return catalog
  })

  const fetchViews = useEffectEvent(async () => {
    const response = await fetch(`/api/v1/sessions/${sessionId}/webui-views`, {
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(
        t("session.extension.viewsSyncFailed", { status: response.status })
      )
    }
    return webUiViewSnapshotsSchema.parse(await response.json())
  })

  const invoke = useCallback(
    async (
      view: Pick<WebUiViewSnapshot, "extensionId" | "instanceId">,
      actionId: string,
      input?: unknown
    ) => {
      if (!authorized) {
        throw new Error(t("session.extension.authorizationPending"))
      }
      const currentView = store.getView(key, view.instanceId)
      if (!currentView || currentView.extensionId !== view.extensionId) {
        throw new Error(t("session.extension.adapterUnavailable"))
      }
      const catalog = store.getState(key).catalog
      const candidate = matchingCandidate(catalog, currentView.adapterKey)
      if (!candidate) throw new Error(t("session.extension.adapterUnavailable"))
      if (
        !isExtensionCandidateAvailable(
          candidate,
          catalog?.projectTrusted === true,
          store.getState(key).catalogInvalidated
        )
      ) {
        throw new Error(t("settings.resources.projectUntrusted"))
      }
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
        throw new Error(result.error ?? t("session.extension.actionFailed"))
      }
      return result.result
    },
    [authorized, key, mutationToken, sessionId, store, t]
  )

  const report = useCallback(
    async (
      view: Pick<WebUiViewSnapshot, "extensionId" | "instanceId">,
      status: "ready" | "error" | "disposed",
      message?: string
    ) => {
      if (!authorized) return
      const currentView = store.getView(key, view.instanceId)
      if (!currentView || currentView.extensionId !== view.extensionId) return
      const catalog = store.getState(key).catalog
      const candidate = matchingCandidate(catalog, currentView.adapterKey)
      if (!candidate) return
      if (
        !isExtensionCandidateAvailable(
          candidate,
          catalog?.projectTrusted === true,
          store.getState(key).catalogInvalidated
        )
      ) {
        return
      }
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
        throw new Error(
          t("session.extension.clientStatusFailed", {
            status: response.status,
          })
        )
      }
    },
    [authorized, key, mutationToken, sessionId, store, t]
  )

  useEffect(() => {
    store.registerTarget(key, projectId)
    const release = store.registerProvider(key)
    if (initialCatalog && !store.getState(key).catalogInvalidated) {
      store.seedCatalog(key, initialCatalog)
    }
    if (initialViews !== null) store.seedViews(key, initialViews)
    const state = store.getState(key)
    if (
      !state.catalog ||
      state.catalogInvalidated ||
      state.catalogNeedsRefresh
    ) {
      void store
        .loadCatalog(key, fetchCatalog, {
          force: state.catalogInvalidated || state.catalogNeedsRefresh,
        })
        .catch(() => undefined)
    }
    return release
  }, [
    identityKey,
    initialCatalog,
    initialViews,
    key,
    projectId,
    sessionId,
    store,
  ])

  const extensionState = useSessionExtensionStateFor(store, key)
  const loadInvalidatedCatalog = useEffectEvent(async () => {
    await store.loadCatalog(key, fetchCatalog, { force: true })
  })
  useEffect(() => {
    if (
      !extensionState.catalogInvalidated &&
      !extensionState.catalogNeedsRefresh
    ) {
      return
    }
    void loadInvalidatedCatalog().catch(() => undefined)
  }, [
    extensionState.catalogInvalidated,
    extensionState.catalogInvalidationRevision,
    extensionState.catalogNeedsRefresh,
    key,
  ])

  const handleRuntimeEvent = useEffectEvent((source: Event) => {
    let event: RuntimeEvent
    try {
      event = z
        .object({ type: z.string().min(1), payload: z.unknown() })
        .parse(JSON.parse((source as MessageEvent<string>).data))
    } catch (failure) {
      store.setViewsError(
        key,
        failure instanceof Error ? failure.message : String(failure)
      )
      return
    }
    if (event.type === "webui.view") {
      store.applyViewEvent(key, webUiViewEventSchema.parse(event.payload))
      return
    }
    if (event.type === "runtime.starting") {
      store.beginRuntimeGeneration(key)
      return
    }
    if (event.type === "runtime.stopped" || event.type === "runtime.crashed") {
      store.endRuntimeGeneration(key)
      return
    }
    if (event.type === "runtime.ready") {
      void sessionController
        .whenEventCheckpointReady()
        .then(() => store.loadViews(key, fetchViews, { force: true }))
        .catch((failure: unknown) => {
          store.setViewsError(
            key,
            failure instanceof Error ? failure.message : String(failure)
          )
        })
      return
    }
    if (event.type === "resync.required") {
      void sessionController
        .whenEventCheckpointReady()
        .then(() =>
          Promise.all([
            store.loadViews(key, fetchViews, { force: true }),
            store.loadCatalog(key, fetchCatalog, { force: true }),
          ])
        )
        .catch(() => undefined)
    }
  })

  useEffect(() => {
    const unsubscribe = sessionEvents.subscribe(
      [
        "webui.view",
        "runtime.starting",
        "runtime.ready",
        "runtime.stopped",
        "runtime.crashed",
        "resync.required",
      ],
      handleRuntimeEvent
    )
    const handleCatalogUpdate = (source: Event) => {
      try {
        const detail = (
          source as CustomEvent<WebUiExtensionCatalogUpdatedDetail>
        ).detail
        if (!detail || typeof detail !== "object") {
          throw new Error("The extension catalog update event was invalid.")
        }
        if (
          detail.projectId !== projectId ||
          detail.catalog.projectId !== projectId ||
          (detail.sessionId !== undefined && detail.sessionId !== sessionId)
        ) {
          return
        }
        if (
          detail.securityEpoch === undefined ||
          detail.securityEpoch !== webUiExtensionCatalogSecurityEpoch(projectId)
        ) {
          void store
            .loadCatalog(key, fetchCatalog, { force: true })
            .catch(() => undefined)
          return
        }
        const current = store.getState(key).catalog
        if (
          current &&
          current.catalogIdentity !== detail.catalog.catalogIdentity
        ) {
          void store
            .loadCatalog(key, fetchCatalog, { force: true })
            .catch(() => undefined)
          return
        }
        store.seedCatalog(key, parseWebUiExtensionCatalog(detail.catalog))
      } catch (failure) {
        store.setCatalogError(
          key,
          failure instanceof Error ? failure.message : String(failure)
        )
      }
    }
    window.addEventListener(
      WEBUI_EXTENSION_CATALOG_UPDATED,
      handleCatalogUpdate
    )
    return () => {
      window.removeEventListener(
        WEBUI_EXTENSION_CATALOG_UPDATED,
        handleCatalogUpdate
      )
      unsubscribe()
    }
  }, [key, projectId, sessionEvents, sessionId, store])

  useEffect(() => {
    let disposed = false
    const loadAfterCheckpoint = async () => {
      const state = store.getState(key)
      if (
        state.viewsStatus === "idle" ||
        state.viewsNeedsRefresh ||
        initialViews !== null
      ) {
        await loadSessionExtensionViewsAfterCheckpoint(
          store,
          key,
          () => sessionController.whenEventCheckpointReady(),
          fetchViews,
          { force: state.viewsNeedsRefresh || initialViews !== null },
          () => !disposed
        )
      } else {
        await sessionController.whenEventCheckpointReady()
      }
    }
    void loadAfterCheckpoint().catch((failure: unknown) => {
      if (disposed) return
      store.setViewsError(
        key,
        failure instanceof Error ? failure.message : String(failure)
      )
    })
    return () => {
      disposed = true
    }
  }, [initialViews, key, sessionController, store])

  const value = useMemo<SessionExtensionContextValue>(
    () => ({
      store,
      key,
      sessionId,
      projectId,
      identityKey,
      mutationToken,
      authorized,
      invoke,
      report,
    }),
    [
      authorized,
      identityKey,
      invoke,
      key,
      mutationToken,
      projectId,
      report,
      sessionId,
      store,
    ]
  )

  return (
    <SessionExtensionContext.Provider value={value}>
      {children}
    </SessionExtensionContext.Provider>
  )
}

function useSessionExtensionStateFor(
  store: SessionExtensionStore,
  key: SessionExtensionKey
) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeState(key, listener),
    [key, store]
  )
  const getSnapshot = useCallback(() => store.getState(key), [key, store])
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_SESSION_EXTENSION_STATE
  )
}
