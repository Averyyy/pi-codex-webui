"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { responseJson } from "@/lib/api-response"
import {
  SESSION_CATALOG_CHANGED,
  type SessionCatalogChangedDetail,
} from "@/lib/session-catalog-events"
import type { SessionListScope, SessionPage } from "@/lib/session-types"
import { SIDEBAR_PAGE_SIZE } from "@/lib/workspace-nav-persistence"

const emptyPage: SessionPage = { sessions: [], nextCursor: null }

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

function appendPage(current: SessionPage, page: SessionPage): SessionPage {
  const sessions = new Map(
    current.sessions.map((session) => [session.id, session])
  )
  for (const session of page.sessions) sessions.set(session.id, session)
  return { sessions: [...sessions.values()], nextCursor: page.nextCursor }
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
  const key = JSON.stringify([
    scope,
    projectId,
    initialPage,
    revision,
    sidebar,
    mutationRevision,
  ])
  const [state, setState] = useState(() => ({
    key,
    page: initialPage ?? emptyPage,
    started: initialPage !== null,
    loading: false,
    error: null as string | null,
  }))
  const requestRef = useRef<{
    key: string
    controller: AbortController
  } | null>(null)
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
    window.addEventListener(SESSION_CATALOG_CHANGED, invalidate)
    return () => window.removeEventListener(SESSION_CATALOG_CHANGED, invalidate)
  }, [projectId, scope])

  const loadMore = useCallback(async () => {
    if (!enabled) return
    if (state.key !== key) {
      setRetryRevision((value) => value + 1)
      return
    }
    if (state.started && !state.page.nextCursor) return
    if (requestRef.current?.key === key) return
    requestRef.current?.controller.abort()
    const controller = new AbortController()
    const request = { key, controller }
    requestRef.current = request
    setState({ ...state, loading: true, error: null })
    try {
      const page = await fetchPage(
        scope,
        projectId,
        state.page.nextCursor,
        controller.signal,
        sidebar
      )
      if (!controller.signal.aborted) {
        setState({
          key,
          page: appendPage(state.page, page),
          started: true,
          loading: false,
          error: null,
        })
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setState({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null
        if (controller.signal.aborted) {
          setState((current) =>
            current.key === key && current.loading
              ? { ...current, loading: false }
              : current
          )
        }
      }
    }
  }, [enabled, state, key, scope, projectId, sidebar])

  useEffect(() => {
    if (enabled) return
    requestRef.current?.controller.abort()
    requestRef.current = null
    setState((current) =>
      current.loading ? { ...current, loading: false } : current
    )
  }, [enabled])

  // A mutation can affect a row outside the first server-rendered page.
  // Refresh the loaded window through bounded requests, keeping the existing
  // rows mounted until the authoritative replacement is ready.
  useEffect(() => {
    if (state.key === key || !enabled) return
    const controller = new AbortController()
    requestRef.current?.controller.abort()
    const request = { key, controller }
    requestRef.current = request
    void (async () => {
      try {
        let page = await fetchPage(
          scope,
          projectId,
          null,
          controller.signal,
          sidebar
        )
        while (
          page.nextCursor &&
          page.sessions.length < state.page.sessions.length
        ) {
          page = appendPage(
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
          setState({ key, page, started: true, loading: false, error: null })
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }))
      } finally {
        if (requestRef.current === request) {
          requestRef.current = null
          if (controller.signal.aborted) {
            setState((current) =>
              current.key === key && current.loading
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
    enabled,
    scope,
    projectId,
    sidebar,
    retryRevision,
  ])

  useEffect(
    () => () => {
      requestRef.current?.controller.abort()
    },
    []
  )

  return {
    sessions: state.page.sessions,
    started: state.started,
    hasMore: !state.started || state.page.nextCursor !== null,
    loading: state.loading || state.key !== key,
    error: state.error,
    loadMore,
  }
}
