"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"

import { SessionClientViewport } from "@/components/session-client-viewport"
import { useModelCatalogStore } from "@/components/model-catalog-provider"
import { prepareSessionModelCatalog } from "@/lib/model-catalog-store"
import { SessionStreamingProvider } from "@/components/session-streaming-context"
import { useI18n } from "@/components/i18n-provider"
import { cancelPendingNavigationMeasurement } from "@/lib/performance-diagnostics"
import {
  SESSION_NAVIGATION_CANCELLED,
  SESSION_NAVIGATION_INTENT,
  dispatchSessionRouteRejected,
} from "@/lib/session-navigation-events"
import type { SessionRouteClientData } from "@/lib/session-route-client"

const MAX_REMEMBERED_SESSIONS = 8

interface SessionRouteTarget {
  sessionId: string
  projectId: string | null
  key: string
}

interface SessionViewportRegistry {
  register(route: SessionRouteClientData): void
  reject(target: SessionRouteTarget): void
}

interface StoredSessionRoute {
  route: SessionRouteClientData
  lastUsed: number
}

const RegistryContext = createContext<SessionViewportRegistry | null>(null)

function decodedSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function sessionRouteTarget(
  pathname: string | null
): SessionRouteTarget | null {
  if (!pathname) return null
  const parts = pathname.split("/").filter(Boolean).map(decodedSegment)
  if (parts.some((part) => part === null)) return null
  const segments = parts as string[]
  let projectId: string | null
  let sessionId: string | undefined
  if (segments.length === 2 && segments[0] === "tasks") {
    projectId = null
    sessionId = segments[1]
  } else if (
    segments.length === 4 &&
    segments[0] === "projects" &&
    segments[2] === "sessions"
  ) {
    projectId = segments[1]!
    sessionId = segments[3]
  } else {
    return null
  }
  if (!sessionId) return null
  return {
    sessionId,
    projectId,
    key: JSON.stringify([projectId, sessionId]),
  }
}

function routeTarget(route: SessionRouteClientData): SessionRouteTarget {
  return {
    sessionId: route.session.id,
    projectId: route.projectId,
    key: JSON.stringify([route.projectId, route.session.id]),
  }
}

function loadingShell(sessionId: string | null, label: string) {
  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-session-loading={sessionId ?? ""}
    >
      <span className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      <span>{label}</span>
    </div>
  )
}

export function SessionRouteSlot({ route }: { route: SessionRouteClientData }) {
  const registry = useContext(RegistryContext)
  if (!registry) {
    throw new Error("SessionRouteSlot requires SessionViewportHost.")
  }
  const { t } = useI18n()

  useEffect(() => {
    registry.register(route)
  }, [registry, route])

  return loadingShell(route.session.id, t("session.list.loading"))
}

export function SessionRouteRejected() {
  const registry = useContext(RegistryContext)
  const pathname = usePathname()
  const target = useMemo(() => sessionRouteTarget(pathname), [pathname])
  useEffect(() => {
    if (!target) return
    registry?.reject(target)
    cancelPendingNavigationMeasurement(pathname ?? undefined)
    dispatchSessionRouteRejected({
      pathname: pathname ?? "",
      sessionId: target.sessionId,
      projectId: target.projectId,
    })
  }, [pathname, registry, target])
  return null
}

export function SessionViewportHost({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const modelCatalogStore = useModelCatalogStore()
  const [navigationState, setNavigationState] = useState(() => ({
    pathname,
    pendingPath: null as string | null,
  }))
  if (navigationState.pathname !== pathname) {
    setNavigationState({ pathname, pendingPath: null })
  }
  const pendingPath =
    navigationState.pathname === pathname ? navigationState.pendingPath : null
  const [confirmedTargetKey, setConfirmedTargetKey] = useState<string | null>(
    null
  )
  const [rejectedTargetKey, setRejectedTargetKey] = useState<string | null>(
    null
  )
  const [routes, setRoutes] = useState<Map<string, StoredSessionRoute>>(
    () => new Map()
  )
  const currentTarget = useMemo(
    () => sessionRouteTarget(pendingPath ?? pathname),
    [pathname, pendingPath]
  )
  const currentTargetRef = useRef(currentTarget)

  const touchRoute = useCallback((path: string | null) => {
    const target = sessionRouteTarget(path)
    if (!target) return
    setRoutes((current) => {
      const stored = current.get(target.sessionId)
      if (!stored || stored.route.projectId !== target.projectId) return current
      const next = new Map(current)
      next.set(target.sessionId, { ...stored, lastUsed: Date.now() })
      return next
    })
  }, [])

  const register = useCallback(
    (route: SessionRouteClientData) => {
      const target = routeTarget(route)
      if (currentTargetRef.current?.key !== target.key) return
      prepareSessionModelCatalog(
        modelCatalogStore,
        route.session.id,
        route.modelCatalogChecked,
        route.modelCatalogBinding
      )

      setRoutes((current) => {
        const next = new Map(current)
        next.set(route.session.id, { route, lastUsed: Date.now() })
        if (next.size > MAX_REMEMBERED_SESSIONS) {
          const leastRecentlyUsed = [...next.entries()]
            .filter(([sessionId]) => sessionId !== target.sessionId)
            .sort(([, left], [, right]) => left.lastUsed - right.lastUsed)[0]
          if (leastRecentlyUsed) next.delete(leastRecentlyUsed[0])
        }
        return next
      })
      setConfirmedTargetKey(target.key)
      setRejectedTargetKey((current) =>
        current === target.key ? null : current
      )
    },
    [modelCatalogStore]
  )

  const reject = useCallback((target: SessionRouteTarget) => {
    setRoutes((current) => {
      if (!current.has(target.sessionId)) return current
      const next = new Map(current)
      next.delete(target.sessionId)
      return next
    })
    setConfirmedTargetKey((current) =>
      current === target.key ? null : current
    )
    setRejectedTargetKey(target.key)
  }, [])

  const registry = useMemo(() => ({ register, reject }), [register, reject])

  useLayoutEffect(() => {
    currentTargetRef.current = currentTarget
  }, [currentTarget])

  useEffect(() => {
    const handleIntent = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: unknown }>).detail
      if (typeof detail?.pathname === "string") {
        setConfirmedTargetKey(null)
        setRejectedTargetKey(null)
        setNavigationState((current) => ({
          ...current,
          pendingPath: detail.pathname as string,
        }))
        touchRoute(detail.pathname)
      }
    }
    const handleHistory = () => {
      setConfirmedTargetKey(null)
      setRejectedTargetKey(null)
      setNavigationState((current) => ({
        ...current,
        pendingPath: window.location.pathname,
      }))
      touchRoute(window.location.pathname)
    }
    const handleCancelled = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: unknown }>).detail
      if (typeof detail?.pathname !== "string") return
      setNavigationState((current) =>
        current.pendingPath === detail.pathname
          ? { ...current, pendingPath: null }
          : current
      )
      setConfirmedTargetKey(null)
      setRejectedTargetKey(null)
    }
    const handleClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest("a[href]")
      if (!(link instanceof HTMLAnchorElement)) return
      if (link.target && link.target !== "_self") return
      if (link.hasAttribute("download")) return
      const destination = new URL(link.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      queueMicrotask(() => {
        if (!event.defaultPrevented) {
          setConfirmedTargetKey(null)
          setRejectedTargetKey(null)
          setNavigationState((current) => ({
            ...current,
            pendingPath: destination.pathname,
          }))
          touchRoute(destination.pathname)
        }
      })
    }

    window.addEventListener(SESSION_NAVIGATION_INTENT, handleIntent)
    window.addEventListener(SESSION_NAVIGATION_CANCELLED, handleCancelled)
    window.addEventListener("popstate", handleHistory)
    document.addEventListener("click", handleClick, true)
    return () => {
      window.removeEventListener(SESSION_NAVIGATION_INTENT, handleIntent)
      window.removeEventListener(SESSION_NAVIGATION_CANCELLED, handleCancelled)
      window.removeEventListener("popstate", handleHistory)
      document.removeEventListener("click", handleClick, true)
    }
  }, [touchRoute])

  const activeRouteEntry = currentTarget
    ? routes.get(currentTarget.sessionId)
    : undefined
  const activeRoute = activeRouteEntry?.route
  const routeMatches =
    activeRoute?.projectId === currentTarget?.projectId &&
    activeRoute?.session.id === currentTarget?.sessionId
  const authorized = routeMatches && confirmedTargetKey === currentTarget?.key

  if (!currentTarget) {
    return <RegistryContext value={registry}>{children}</RegistryContext>
  }
  if (rejectedTargetKey === currentTarget.key) {
    return <RegistryContext value={registry}>{children}</RegistryContext>
  }
  if (!routeMatches || !activeRoute) {
    return (
      <RegistryContext value={registry}>
        {loadingShell(currentTarget.sessionId, t("session.list.loading"))}
        <div hidden aria-hidden="true" inert>
          {children}
        </div>
      </RegistryContext>
    )
  }

  return (
    <RegistryContext value={registry}>
      <div hidden aria-hidden="true" inert>
        {children}
      </div>
      <SessionStreamingProvider
        key={activeRoute.identityKey}
        identityKey={activeRoute.identityKey}
        sessionId={activeRoute.session.id}
        selectedNativeFileRevision={
          activeRoute.nativeFileChanged
            ? activeRoute.nativeFileRevision
            : undefined
        }
        initialView={null}
      >
        <SessionClientViewport
          route={activeRoute}
          identityVerified={Boolean(authorized)}
        />
      </SessionStreamingProvider>
    </RegistryContext>
  )
}
