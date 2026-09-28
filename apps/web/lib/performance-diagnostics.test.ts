import assert from "node:assert/strict"
import test from "node:test"

import {
  enablePerformanceDiagnosticsFromBrowser,
  getPerformanceDiagnosticsReport,
  recordCachedViewportReady,
  recordPathnameCommit,
  stopPerformanceDiagnostics,
} from "./performance-diagnostics"
import { SESSION_NAVIGATION_INTENT } from "./session-navigation-events"

test("cached viewport and document navigation metrics survive commit timing", () => {
  const priorWindow = globalThis.window
  const priorDocument = globalThis.document
  const priorPerformance = globalThis.performance
  const priorObserver = globalThis.PerformanceObserver
  const priorAnimationFrame = globalThis.requestAnimationFrame
  const priorSetTimeout = globalThis.setTimeout
  const scheduledLoadMeasurements: Array<() => void> = []
  const realPerformance = priorPerformance
  const navigationEntry = { duration: 123, loadEventEnd: 0 }
  const fakePerformance = {
    now: () => realPerformance.now(),
    getEntriesByType: (type: string) =>
      type === "navigation"
        ? [navigationEntry as unknown as PerformanceNavigationTiming]
        : [],
  } as unknown as Performance
  const fakeWindow = new EventTarget() as unknown as Window
  Object.defineProperties(fakeWindow, {
    location: {
      value: { search: "?performance=1", origin: "http://localhost" },
    },
    sessionStorage: {
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  })
  const fakeDocument = new EventTarget() as unknown as Document
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  })
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
  })
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: fakePerformance,
  })
  Object.defineProperty(globalThis, "PerformanceObserver", {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(fakePerformance.now())
      return 1
    },
  })
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: (callback: () => void) => {
      scheduledLoadMeasurements.push(callback)
      return scheduledLoadMeasurements.length
    },
  })

  try {
    assert.equal(enablePerformanceDiagnosticsFromBrowser(), true)
    recordPathnameCommit("/tasks/session-a")
    fakeWindow.dispatchEvent(
      new CustomEvent(SESSION_NAVIGATION_INTENT, {
        detail: { pathname: "/tasks/session-b" },
      })
    )

    // The cached viewport can commit before the slow Flight route commits.
    recordCachedViewportReady("/tasks/session-a")
    assert.equal(getPerformanceDiagnosticsReport().cachedViewReady.count, 0)
    recordPathnameCommit("/tasks/session-b")
    recordCachedViewportReady("/tasks/session-b")

    const report = getPerformanceDiagnosticsReport()
    assert.equal(report.cachedViewReady.count, 1)
    assert.ok((report.cachedViewReady.maxMs ?? -1) >= 0)
    assert.equal(report.routeCommit.count, 1)

    fakeWindow.dispatchEvent(new Event("load"))
    navigationEntry.loadEventEnd = 123
    assert.equal(scheduledLoadMeasurements.length, 1)
    const loadMeasurement = scheduledLoadMeasurements.shift()
    assert.ok(loadMeasurement)
    loadMeasurement()
    const afterLoad = getPerformanceDiagnosticsReport()
    assert.equal(afterLoad.documentNavigation.count, 1)
    assert.equal(afterLoad.documentNavigation.maxMs, 123)
  } finally {
    stopPerformanceDiagnostics()
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: priorWindow,
    })
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: priorDocument,
    })
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: priorPerformance,
    })
    Object.defineProperty(globalThis, "PerformanceObserver", {
      configurable: true,
      value: priorObserver,
    })
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: priorAnimationFrame,
    })
    Object.defineProperty(globalThis, "setTimeout", {
      configurable: true,
      value: priorSetTimeout,
    })
  }
})
