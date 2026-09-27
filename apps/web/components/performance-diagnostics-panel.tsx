"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

import {
  cancelPendingNavigationMeasurement,
  enablePerformanceDiagnosticsFromBrowser,
  getPerformanceDiagnosticsReport,
  resetPerformanceSamples,
  recordPathnameCommit,
  stopPerformanceDiagnostics,
  subscribePerformanceDiagnostics,
} from "@/lib/performance-diagnostics"
import {
  SESSION_NAVIGATION_CANCELLED,
  SESSION_ROUTE_REJECTED,
} from "@/lib/session-navigation-events"

export function PerformanceDiagnosticsPanel() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(true)
  const report = useSyncExternalStore(
    subscribePerformanceDiagnostics,
    getPerformanceDiagnosticsReport,
    getPerformanceDiagnosticsReport
  )
  const enabled = report.enabled

  useEffect(() => {
    void enablePerformanceDiagnosticsFromBrowser()
  }, [])

  useEffect(() => {
    if (!enabled) return
    recordPathnameCommit(pathname)
  }, [enabled, pathname])

  useEffect(() => {
    if (!enabled) return
    const cancel = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: string }>).detail
      cancelPendingNavigationMeasurement(detail?.pathname)
    }
    window.addEventListener(SESSION_NAVIGATION_CANCELLED, cancel)
    window.addEventListener(SESSION_ROUTE_REJECTED, cancel)
    return () => {
      window.removeEventListener(SESSION_NAVIGATION_CANCELLED, cancel)
      window.removeEventListener(SESSION_ROUTE_REJECTED, cancel)
    }
  }, [enabled])

  if (!enabled) return null

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          data-performance-toggle
          className="fixed right-2 bottom-2 z-[100] rounded-full border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-lg"
          aria-label="Expand performance diagnostics"
          onClick={() => setCollapsed(false)}
        >
          Perf
        </button>
        <output data-performance-report className="sr-only">
          {JSON.stringify(report)}
        </output>
      </>
    )
  }

  return (
    <aside
      className="fixed top-14 right-3 z-[100] w-[min(32rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border bg-background/95 text-foreground shadow-xl backdrop-blur"
      aria-label="Performance diagnostics"
    >
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium">
        <span>Performance diagnostics (this tab only; no network)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded px-2 py-1 underline"
            onClick={() => {
              resetPerformanceSamples(pathname)
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 underline"
            onClick={() => setCollapsed(true)}
          >
            Collapse
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 underline"
            onClick={() => {
              stopPerformanceDiagnostics()
            }}
          >
            Stop
          </button>
        </div>
      </div>
      <pre
        data-performance-report
        className="max-h-[32vh] overflow-auto p-3 text-[11px] leading-relaxed"
      >
        {JSON.stringify(report, null, 2)}
      </pre>
      <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
        routeCommit measures navigation intent to pathname commit;
        cachedViewReady measures an early cached viewport; inputToFrame measures
        composer input to the next animation frame.
      </p>
    </aside>
  )
}
