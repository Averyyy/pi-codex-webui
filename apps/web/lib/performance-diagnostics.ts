import { SESSION_NAVIGATION_INTENT } from "@/lib/session-navigation-events"

export type PerformanceMetricName =
  | "documentNavigation"
  | "routeCommit"
  | "cachedViewReady"
  | "inputToFrame"
  | "modelCatalogRead"
  | "modelCatalogRefresh"
  | "extensionCatalogRefresh"
  | "longTask"
  | "conversationComposer"
  | "composerModelOptions"
  | "sessionRuntime"
  | "sessionWorkspace"

export interface PerformanceMetricSummary {
  count: number
  p50Ms: number | null
  p95Ms: number | null
  maxMs: number | null
}

export interface PerformanceDiagnosticsReport {
  enabled: boolean
  sampleLimit: number
  totalSamples: number
  documentNavigation: PerformanceMetricSummary
  routeCommit: PerformanceMetricSummary
  cachedViewReady: PerformanceMetricSummary
  inputToFrame: PerformanceMetricSummary
  modelCatalogRead: PerformanceMetricSummary
  modelCatalogRefresh: PerformanceMetricSummary
  extensionCatalogRefresh: PerformanceMetricSummary
  react: {
    available: boolean
    limitation: string | null
    conversationComposer: PerformanceMetricSummary
    composerModelOptions: PerformanceMetricSummary
    sessionRuntime: PerformanceMetricSummary
    sessionWorkspace: PerformanceMetricSummary
  }
  longTasks: {
    available: boolean
    limitation: string | null
    summary: PerformanceMetricSummary
  }
}

const OPT_IN_KEY = "pi-web-codex.performance-diagnostics.v1"
const MAX_SAMPLES_PER_METRIC = 128
const metricNames: PerformanceMetricName[] = [
  "documentNavigation",
  "routeCommit",
  "cachedViewReady",
  "inputToFrame",
  "modelCatalogRead",
  "modelCatalogRefresh",
  "extensionCatalogRefresh",
  "longTask",
  "conversationComposer",
  "composerModelOptions",
  "sessionRuntime",
  "sessionWorkspace",
]

const samples = new Map<PerformanceMetricName, number[]>(
  metricNames.map((name) => [name, []])
)
const listeners = new Set<() => void>()
let cachedReport: PerformanceDiagnosticsReport | null = null
let enabled = false
let longTaskAvailable = false
let longTaskLimitation = "Long Task PerformanceObserver is unavailable."
let observer: PerformanceObserver | null = null
let pendingRouteCommitStart: number | null = null
let pendingRouteDestinationPathname: string | null = null
let pendingCachedViewStart: number | null = null
let pendingCachedDestinationPathname: string | null = null
let pendingNavigationSource: "click" | "intent" | "history" | null = null
let lastPathname: string | null = null
let inputListener: EventListener | null = null
let navigationClickListener: EventListener | null = null
let popstateListener: (() => void) | null = null
let navigationIntentListener: EventListener | null = null
let loadListener: (() => void) | null = null
let loadMeasurementTimer: ReturnType<typeof setTimeout> | null = null

function finalizedNavigationEntry() {
  return performance.getEntriesByType("navigation").at(0) as
    PerformanceNavigationTiming | undefined
}

function notify() {
  cachedReport = null
  for (const listener of listeners) listener()
}

function roundMilliseconds(value: number) {
  return Math.round(value * 10) / 10
}

function summarize(values: number[]): PerformanceMetricSummary {
  if (values.length === 0) {
    return { count: 0, p50Ms: null, p95Ms: null, maxMs: null }
  }
  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (fraction: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null
  return {
    count: values.length,
    p50Ms: roundMilliseconds(percentile(0.5)!),
    p95Ms: roundMilliseconds(percentile(0.95)!),
    maxMs: roundMilliseconds(sorted.at(-1)!),
  }
}

function record(name: PerformanceMetricName, durationMs: number) {
  if (!enabled || !Number.isFinite(durationMs) || durationMs < 0) return
  const values = samples.get(name)
  if (!values) return
  values.push(durationMs)
  if (values.length > MAX_SAMPLES_PER_METRIC) values.shift()
  notify()
}

function beginNavigation(
  pathname: string | null,
  source: "click" | "intent" | "history"
) {
  const startedAt = performance.now()
  pendingRouteCommitStart = startedAt
  pendingRouteDestinationPathname = pathname
  pendingCachedViewStart = startedAt
  pendingCachedDestinationPathname = pathname
  pendingNavigationSource = source
}

function subscribeNavigationAndInput() {
  if (typeof document === "undefined" || typeof window === "undefined") return
  const onInput: EventListener = (event) => {
    const target = event.target
    if (
      !(target instanceof Element) ||
      !target.closest("[data-composer-input]")
    ) {
      return
    }
    const startedAt = performance.now()
    requestAnimationFrame(() =>
      record("inputToFrame", performance.now() - startedAt)
    )
  }
  inputListener = onInput
  const onNavigationIntent: EventListener = (event) => {
    const destination = (event as CustomEvent<{ pathname?: unknown }>).detail
      ?.pathname
    const destinationPathname =
      typeof destination === "string"
        ? new URL(destination, window.location.origin).pathname
        : null
    if (destinationPathname !== null && destinationPathname === lastPathname)
      return
    if (
      pendingNavigationSource === "click" &&
      pendingCachedDestinationPathname === destinationPathname
    ) {
      return
    }
    beginNavigation(destinationPathname, "intent")
  }
  const onNavigationClick: EventListener = (event) => {
    const click = event as MouseEvent
    if (
      click.button !== 0 ||
      click.metaKey ||
      click.ctrlKey ||
      click.shiftKey ||
      click.altKey
    ) {
      return
    }
    const target = click.target
    if (!(target instanceof Element)) return
    const link = target.closest("a[href]")
    if (!(link instanceof HTMLAnchorElement)) return
    if (link.target && link.target !== "_self") return
    if (link.hasAttribute("download")) return
    const destination = new URL(link.href, window.location.href)
    if (destination.origin !== window.location.origin) return
    if (destination.pathname === lastPathname) return
    beginNavigation(destination.pathname, "click")
  }
  navigationClickListener = onNavigationClick
  navigationIntentListener = onNavigationIntent
  const onPopState = () => {
    if (window.location.pathname !== lastPathname) {
      beginNavigation(window.location.pathname, "history")
    }
  }
  popstateListener = onPopState
  document.addEventListener("input", onInput, true)
  document.addEventListener("click", onNavigationClick, true)
  window.addEventListener(SESSION_NAVIGATION_INTENT, onNavigationIntent)
  window.addEventListener("popstate", onPopState)
}

function stopNavigationAndInput() {
  if (typeof document !== "undefined") {
    if (inputListener)
      document.removeEventListener("input", inputListener, true)
    if (navigationClickListener) {
      document.removeEventListener("click", navigationClickListener, true)
    }
  }
  if (typeof window !== "undefined") {
    if (navigationIntentListener) {
      window.removeEventListener(
        SESSION_NAVIGATION_INTENT,
        navigationIntentListener
      )
    }
    if (popstateListener)
      window.removeEventListener("popstate", popstateListener)
  }
  inputListener = null
  navigationClickListener = null
  navigationIntentListener = null
  popstateListener = null
}

function startObservers() {
  subscribeNavigationAndInput()
  if (typeof PerformanceObserver === "undefined") {
    longTaskAvailable = false
    longTaskLimitation = "PerformanceObserver is unavailable in this browser."
  } else if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    longTaskAvailable = false
    longTaskLimitation = "This browser does not expose long-task entries."
  } else {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          record("longTask", entry.duration)
      })
      observer.observe({ entryTypes: ["longtask"] })
      longTaskAvailable = true
      longTaskLimitation = ""
    } catch {
      observer = null
      longTaskAvailable = false
      longTaskLimitation = "The browser rejected long-task observation."
    }
  }
  const navigationEntry = finalizedNavigationEntry()
  if (
    navigationEntry &&
    navigationEntry.loadEventEnd > 0 &&
    navigationEntry.duration > 0
  ) {
    record("documentNavigation", navigationEntry.duration)
  } else if (typeof window !== "undefined" && typeof document !== "undefined") {
    const readCompletedNavigationEntry = () => {
      loadMeasurementTimer = null
      const loadedEntry = finalizedNavigationEntry()
      if (
        loadedEntry &&
        loadedEntry.loadEventEnd > 0 &&
        loadedEntry.duration > 0
      ) {
        record("documentNavigation", loadedEntry.duration)
      }
    }
    const scheduleNavigationRead = () => {
      if (loadMeasurementTimer !== null) clearTimeout(loadMeasurementTimer)
      loadMeasurementTimer = setTimeout(readCompletedNavigationEntry, 0)
    }
    if (document.readyState === "complete") {
      scheduleNavigationRead()
    } else {
      loadListener = () => {
        if (loadListener) window.removeEventListener("load", loadListener)
        loadListener = null
        scheduleNavigationRead()
      }
      window.addEventListener("load", loadListener, { once: true })
    }
  }
}

export function enablePerformanceDiagnosticsFromBrowser() {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  const requested = params.get("performance") === "1"
  const disabled = params.get("performance") === "0"
  let persisted = false
  try {
    if (disabled) window.sessionStorage.removeItem(OPT_IN_KEY)
    else if (requested) window.sessionStorage.setItem(OPT_IN_KEY, "1")
    persisted = window.sessionStorage.getItem(OPT_IN_KEY) === "1"
  } catch {
    persisted = false
  }
  if (!requested && !persisted) return false
  if (!enabled) {
    enabled = true
    startObservers()
    notify()
  }
  return true
}

export function stopPerformanceDiagnostics() {
  enabled = false
  observer?.disconnect()
  observer = null
  stopNavigationAndInput()
  if (typeof window !== "undefined" && loadListener) {
    window.removeEventListener("load", loadListener)
  }
  loadListener = null
  if (loadMeasurementTimer !== null) clearTimeout(loadMeasurementTimer)
  loadMeasurementTimer = null
  try {
    if (typeof window !== "undefined")
      window.sessionStorage.removeItem(OPT_IN_KEY)
  } catch {
    // The visible stop control still disables collection for this page.
  }
  for (const values of samples.values()) values.length = 0
  pendingRouteCommitStart = null
  pendingRouteDestinationPathname = null
  pendingCachedViewStart = null
  pendingCachedDestinationPathname = null
  pendingNavigationSource = null
  lastPathname = null
  notify()
}

export function isPerformanceDiagnosticsEnabled() {
  return enabled
}

export function subscribePerformanceDiagnostics(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPerformanceDiagnosticsReport(): PerformanceDiagnosticsReport {
  if (cachedReport) return cachedReport
  const reactAvailable = process.env.NODE_ENV !== "production"
  const reportMetric = (name: PerformanceMetricName) =>
    summarize(samples.get(name) ?? [])
  const totalSamples = metricNames.reduce(
    (count, name) => count + (samples.get(name)?.length ?? 0),
    0
  )
  cachedReport = {
    enabled,
    sampleLimit: MAX_SAMPLES_PER_METRIC,
    totalSamples,
    documentNavigation: reportMetric("documentNavigation"),
    routeCommit: reportMetric("routeCommit"),
    cachedViewReady: reportMetric("cachedViewReady"),
    inputToFrame: reportMetric("inputToFrame"),
    modelCatalogRead: reportMetric("modelCatalogRead"),
    modelCatalogRefresh: reportMetric("modelCatalogRefresh"),
    extensionCatalogRefresh: reportMetric("extensionCatalogRefresh"),
    react: {
      available: reactAvailable,
      limitation: reactAvailable
        ? null
        : "React Profiler callbacks are disabled in the ordinary production build.",
      conversationComposer: reportMetric("conversationComposer"),
      composerModelOptions: reportMetric("composerModelOptions"),
      sessionRuntime: reportMetric("sessionRuntime"),
      sessionWorkspace: reportMetric("sessionWorkspace"),
    },
    longTasks: {
      available: longTaskAvailable,
      limitation: longTaskAvailable ? null : longTaskLimitation,
      summary: reportMetric("longTask"),
    },
  }
  return cachedReport
}

export function recordPerformanceMetric(
  name: PerformanceMetricName,
  durationMs: number
) {
  record(name, durationMs)
}

export function recordReactProfilerMetric(
  probe:
    | "conversationComposer"
    | "composerModelOptions"
    | "sessionRuntime"
    | "sessionWorkspace",
  actualDuration: number
) {
  if (process.env.NODE_ENV !== "production") {
    record(probe, actualDuration)
  }
}

export async function measurePerformance<T>(
  name: "modelCatalogRead" | "modelCatalogRefresh" | "extensionCatalogRefresh",
  operation: () => Promise<T>
) {
  if (!enabled || typeof performance === "undefined") return operation()
  const startedAt = performance.now()
  try {
    return await operation()
  } finally {
    record(name, performance.now() - startedAt)
  }
}

export function recordPathnameCommit(pathname: string | null) {
  if (!enabled || pathname === null) return
  if (lastPathname === null) {
    lastPathname = pathname
    return
  }
  if (pathname === lastPathname) return
  lastPathname = pathname
  const startedAt = pendingRouteCommitStart
  pendingRouteCommitStart = null
  const destinationPathname = pendingRouteDestinationPathname
  pendingRouteDestinationPathname = null
  pendingNavigationSource = null
  if (
    pendingCachedDestinationPathname !== null &&
    pendingCachedDestinationPathname !== pathname
  ) {
    pendingCachedViewStart = null
    pendingCachedDestinationPathname = null
  }
  if (startedAt === null) return
  if (destinationPathname !== null && destinationPathname !== pathname) return
  requestAnimationFrame(() =>
    record("routeCommit", performance.now() - startedAt)
  )
}

export function recordCachedViewportReady(pathname: string) {
  if (!enabled || pendingCachedViewStart === null) return false
  const readyPathname = new URL(
    pathname,
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  ).pathname
  if (readyPathname !== pendingCachedDestinationPathname) return false
  const startedAt = pendingCachedViewStart
  pendingCachedViewStart = null
  pendingCachedDestinationPathname = null
  record("cachedViewReady", performance.now() - startedAt)
  return true
}

export function getCachedViewportMeasurementState() {
  return {
    enabled,
    pending: pendingCachedViewStart !== null,
    destinationPathname: pendingCachedDestinationPathname,
  }
}

export function cancelCachedViewportMeasurement(pathname: string) {
  const cancelledPathname = new URL(
    pathname,
    typeof window === "undefined" ? "http://localhost" : window.location.origin
  ).pathname
  if (cancelledPathname !== pendingCachedDestinationPathname) return
  pendingCachedViewStart = null
  pendingCachedDestinationPathname = null
}

export function cancelPendingNavigationMeasurement(pathname?: string) {
  const cancelledPathname = pathname
    ? new URL(
        pathname,
        typeof window === "undefined"
          ? "http://localhost"
          : window.location.origin
      ).pathname
    : null
  if (cancelledPathname !== null) {
    const matchesRoute = cancelledPathname === pendingRouteDestinationPathname
    const matchesCached = cancelledPathname === pendingCachedDestinationPathname
    if (!matchesRoute && !matchesCached) return
  }
  pendingRouteCommitStart = null
  pendingRouteDestinationPathname = null
  pendingCachedViewStart = null
  pendingCachedDestinationPathname = null
  pendingNavigationSource = null
}

export function resetPerformanceSamples(pathname: string | null = null) {
  for (const values of samples.values()) values.length = 0
  pendingRouteCommitStart = null
  pendingRouteDestinationPathname = null
  pendingCachedViewStart = null
  pendingCachedDestinationPathname = null
  pendingNavigationSource = null
  if (typeof window !== "undefined" && loadListener) {
    window.removeEventListener("load", loadListener)
  }
  loadListener = null
  if (loadMeasurementTimer !== null) clearTimeout(loadMeasurementTimer)
  loadMeasurementTimer = null
  lastPathname = pathname
  notify()
}
