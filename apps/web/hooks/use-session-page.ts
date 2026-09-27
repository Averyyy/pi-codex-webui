"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { responseJson } from "@/lib/api-response"
import {
  applySessionEntityUpdate,
  SESSION_CATALOG_CHANGED,
  SESSION_ENTITY_UPDATED,
  type SessionCatalogChangedDetail,
  type SessionEntityUpdatedDetail,
} from "@/lib/session-catalog-events"
import type { SessionListScope, SessionPage } from "@/lib/session-types"
import {
  appendSessionPage,
  applyPendingSessionEntityUpdates,
  clearConfirmedSessionEntityUpdates,
  mergeSessionEntityUpdateOverlay,
  sessionPageQueryIdentity,
  type SessionEntityUpdateOverlay,
} from "@/lib/session-page-data"
import { SIDEBAR_PAGE_SIZE } from "@/lib/workspace-nav-persistence"

const emptyPage: SessionPage = { sessions: [], nextCursor: null }
const MAX_ENTITY_UPDATES = 256

interface PageState {
  key: string
  targetKey: string
  page: SessionPage
  started: boolean
  loading: boolean
  error: string | null
}

async function fetchPage(
  scope: SessionListScope,
  projectId: string | undefined,
  cursor: string | null,
  signal: AbortSignal,
  sidebar: boolean
) {
  const params = new URLSearchParams({ scope })
  if (projectId) params.set("projectId", projectId)
  if (cursor) params.set("cursor", cursor)
  if (sidebar) {
    params.set("order", "sidebar")
    params.set("limit", String(SIDEBAR_PAGE_SIZE))
  }
  const page = await responseJson<SessionPage>(
    await fetch(`/api/v1/session-catalog?${params}`, {
      cache: "no-store",
      signal,
    })
  )
  if (
    !Array.isArray(page.sessions) ||
    !(page.nextCursor === null || typeof page.nextCursor === "string")
  ) {
    throw new Error("Invalid session page response.")
  }
  return page
}

export function useSessionPage({
  scope,
  projectId,
  initialPage = null,
  enabled = true,
  revision = "",
  sidebar = false,
}: {
  scope: SessionListScope
  projectId?: string
  initialPage?: SessionPage | null
  enabled?: boolean
  revision?: string
  sidebar?: boolean
}) {
  const [mutationRevision, setMutationRevision] = useState(0)
  const targetKey = JSON.stringify([scope, projectId ?? null, sidebar])
  const key = sessionPageQueryIdentity(
    scope,
    projectId,
    sidebar,
    revision,
    mutationRevision
  )
  const [state, setState] = useState<PageState>(() => ({
    key,
    targetKey,
    page: initialPage ?? emptyPage,
    started: initialPage !== null,
    loading: false,
    error: null,
  }))
  const requestRef = useRef<{
    key: string
    targetKey: string
    controller: AbortController
  } | null>(null)
  const entityUpdatesRef = useRef(new Map<string, SessionEntityUpdateOverlay>())
  const entityRevisionRef = useRef(0)
  const [retryRevision, setRetryRevision] = useState(0)

  useEffect(() => {
    const invalidate = (event: Event) => {
      const detail = (event as CustomEvent<SessionCatalogChangedDetail>).detail
      if (
        detail?.scope &&
        (detail.scope !== scope ||
          (detail.scope === "project" && detail.projectId !== projectId))
      ) {
        return
      }
      setMutationRevision((value) => value + 1)
    }
    const updateEntity = (event: Event) => {
      const detail = (event as CustomEvent<SessionEntityUpdatedDetail>).detail
      if (!detail?.sessionId) return
      const revision = ++entityRevisionRef.current
      const previous = entityUpdatesRef.current.get(detail.sessionId)
      entityUpdatesRef.current.delete(detail.sessionId)
      entityUpdatesRef.current.set(
        detail.sessionId,
        mergeSessionEntityUpdateOverlay(previous, detail, revision)
      )
      while (entityUpdatesRef.current.size > MAX_ENTITY_UPDATES) {
        const oldest = entityUpdatesRef.current.keys().next().value
        if (oldest === undefined) break
        entityUpdatesRef.current.delete(oldest)
      }
      setState((current) => {
        if (current.targetKey !== targetKey) return current
        const page = applySessionEntityUpdate(current.page, detail)
        return page === current.page ? current : { ...current, page }
      })
    }
    window.addEventListener(SESSION_CATALOG_CHANGED, invalidate)
    window.addEventListener(SESSION_ENTITY_UPDATED, updateEntity)
    return () => {
      window.removeEventListener(SESSION_CATALOG_CHANGED, invalidate)
      window.removeEventListener(SESSION_ENTITY_UPDATED, updateEntity)
    }
  }, [projectId, scope, targetKey])

  useEffect(() => {
    if (state.targetKey === targetKey) return
    requestRef.current?.controller.abort()
    requestRef.current = null
    entityUpdatesRef.current.clear()
    entityRevisionRef.current = 0
    setState({
      key,
      targetKey,
      page: initialPage ?? emptyPage,
      started: initialPage !== null,
      loading: false,
      error: null,
    })
  }, [initialPage, key, state.targetKey, targetKey])

  const loadMore = useCallback(async () => {
    if (!enabled) return
    if (state.targetKey !== targetKey || state.key !== key) {
      setRetryRevision((value) => value + 1)
      return
    }
    if (state.started && !state.page.nextCursor) return
    if (requestRef.current?.key === key) return
    requestRef.current?.controller.abort()
    const controller = new AbortController()
    const request = { key, targetKey, controller }
    requestRef.current = request
    const requestEntityRevision = entityRevisionRef.current
    setState((current) =>
      current.targetKey === targetKey
        ? { ...current, loading: true, error: null }
        : current
    )
    try {
      const page = await fetchPage(
        scope,
        projectId,
        state.page.nextCursor,
        controller.signal,
        sidebar
      )
      if (!controller.signal.aborted) {
        const responseUpdates = new Map(entityUpdatesRef.current)
        setState((current) => {
          if (current.targetKey !== targetKey) return current
          const appended = appendSessionPage(current.page, page)
          const updated = applyPendingSessionEntityUpdates(
            appended,
            responseUpdates,
            requestEntityRevision
          )
          return {
            key,
            targetKey,
            page: updated,
            started: true,
            loading: false,
            error: null,
          }
        })
        clearConfirmedSessionEntityUpdates(
          entityUpdatesRef.current,
          responseUpdates,
          page.sessions.map((session) => session.id)
        )
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setState((current) =>
          current.targetKey === targetKey
            ? {
                ...current,
                loading: false,
                error: error instanceof Error ? error.message : String(error),
              }
            : current
        )
      }
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null
        if (controller.signal.aborted) {
          setState((current) =>
            current.targetKey === targetKey &&
            current.key === key &&
            current.loading
              ? { ...current, loading: false }
              : current
          )
        }
      }
    }
  }, [enabled, key, projectId, scope, sidebar, state, targetKey])

  useEffect(() => {
    if (enabled) return
    requestRef.current?.controller.abort()
    requestRef.current = null
    setState((current) =>
      current.loading ? { ...current, loading: false } : current
    )
  }, [enabled])

  // Structural mutations reload the loaded window through the explicit catalog
  // event. Title and unread updates are applied by entity ID and never enter it.
  useEffect(() => {
    if (state.targetKey !== targetKey || state.key === key || !enabled) return
    const controller = new AbortController()
    requestRef.current?.controller.abort()
    const request = { key, targetKey, controller }
    requestRef.current = request
    const requestEntityRevision = entityRevisionRef.current
    const loadedCount = state.page.sessions.length
    setState((current) =>
      current.targetKey === targetKey
        ? { ...current, loading: true, error: null }
        : current
    )
    void (async () => {
      try {
        let page = await fetchPage(
          scope,
          projectId,
          null,
          controller.signal,
          sidebar
        )
        while (page.nextCursor && page.sessions.length < loadedCount) {
          page = appendSessionPage(
            page,
            await fetchPage(
              scope,
              projectId,
              page.nextCursor,
              controller.signal,
              sidebar
            )
          )
        }
        if (!controller.signal.aborted) {
          const responseUpdates = new Map(entityUpdatesRef.current)
          setState((current) =>
            current.targetKey === targetKey
              ? {
                  key,
                  targetKey,
                  page: applyPendingSessionEntityUpdates(
                    page,
                    responseUpdates,
                    requestEntityRevision
                  ),
                  started: true,
                  loading: false,
                  error: null,
                }
              : current
          )
          clearConfirmedSessionEntityUpdates(
            entityUpdatesRef.current,
            responseUpdates,
            page.sessions.map((session) => session.id)
          )
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((current) =>
            current.targetKey === targetKey
              ? {
                  ...current,
                  key,
                  loading: false,
                  error: error instanceof Error ? error.message : String(error),
                }
              : current
          )
        }
      } finally {
        if (requestRef.current === request) {
          requestRef.current = null
          if (controller.signal.aborted) {
            setState((current) =>
              current.targetKey === targetKey &&
              current.key === key &&
              current.loading
                ? { ...current, loading: false }
                : current
            )
          }
        }
      }
    })()
    return () => controller.abort()
  }, [
    key,
    state.key,
    state.page.sessions.length,
    state.targetKey,
    enabled,
    scope,
    projectId,
    sidebar,
    retryRevision,
    targetKey,
  ])

  useEffect(
    () => () => {
      requestRef.current?.controller.abort()
    },
    []
  )

  const visibleState =
    state.targetKey === targetKey
      ? state
      : {
          key,
          targetKey,
          page: initialPage ?? emptyPage,
          started: initialPage !== null,
          loading: false,
          error: null,
        }

  return {
    sessions: visibleState.page.sessions,
    started: visibleState.started,
    hasMore: !visibleState.started || visibleState.page.nextCursor !== null,
    loading:
      state.targetKey !== targetKey
        ? initialPage === null
        : state.loading || state.key !== key,
    error: visibleState.error,
    loadMore,
  }
}
