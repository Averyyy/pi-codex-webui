import assert from "node:assert/strict"
import test from "node:test"

import type { SessionRouteClientData } from "@/lib/session-route-client"
import type { SessionViewController } from "@/lib/session-view-controller"
import {
  MAX_RETAINED_SESSION_VIEWPORTS,
  retainSessionViewportRoute,
  SessionViewportCache,
  type StoredSessionRoute,
} from "@/lib/session-viewport-cache"

function route(id: string, identityKey = id): SessionRouteClientData {
  return {
    session: { id },
    identityKey,
    projectId: null,
  } as SessionRouteClientData
}

test("retained viewport cache evicts the oldest route and replaces changed identity", () => {
  let routes = new Map<string, StoredSessionRoute>()
  for (let index = 0; index < MAX_RETAINED_SESSION_VIEWPORTS; index++) {
    const id = `session-${index}`
    routes = retainSessionViewportRoute(routes, {
      route: route(id),
      lastUsed: index,
    })
  }
  routes = retainSessionViewportRoute(routes, {
    route: route("session-0"),
    lastUsed: 100,
  })
  routes = retainSessionViewportRoute(routes, {
    route: route("session-8"),
    lastUsed: 101,
  })

  assert.equal(routes.size, MAX_RETAINED_SESSION_VIEWPORTS)
  assert.equal(routes.has("session-0"), true)
  assert.equal(routes.has("session-1"), false)
  assert.equal(routes.has("session-8"), true)

  routes = retainSessionViewportRoute(routes, {
    route: route("session-0", "changed"),
    lastUsed: 102,
  })
  assert.equal(routes.size, MAX_RETAINED_SESSION_VIEWPORTS)
  assert.equal(routes.get("session-0")?.route.identityKey, "changed")
})

test("root cache keeps a controller across workspace unmount and retires only the evicted identity", () => {
  const disposed: string[] = []
  const cache = new SessionViewportCache(
    (sessionId) =>
      ({
        dispose: () => disposed.push(sessionId),
      }) as unknown as SessionViewController
  )
  cache.register(route("session-0"), 0)
  const original = cache.getSnapshot().get("session-0")!.controller
  const releaseWorkspaceOwner = cache.retainOwner(original)
  releaseWorkspaceOwner()
  assert.equal(cache.getSnapshot().get("session-0")?.controller, original)
  assert.deepEqual(disposed, [])

  const releaseReopenedOwner = cache.retainOwner(original)
  for (let index = 1; index <= MAX_RETAINED_SESSION_VIEWPORTS; index++) {
    cache.register(route(`session-${index}`), index)
  }
  assert.equal(cache.getSnapshot().has("session-0"), false)
  assert.deepEqual(disposed, [])
  releaseReopenedOwner()
  assert.deepEqual(disposed, ["session-0"])

  const retained = cache.getSnapshot().get("session-8")!.controller
  cache.register(route("session-8", "changed"), 100)
  assert.notEqual(cache.getSnapshot().get("session-8")?.controller, retained)
  assert.deepEqual(disposed, ["session-0", "session-8"])
  cache.dispose()
  assert.equal(cache.getSnapshot().size, 0)
  assert.equal(disposed.length, 10)
})

test("typed missing view evicts only its exact owner and blocks stale route props", () => {
  const disposed: string[] = []
  const missing = new Map<string, (message: string) => void>()
  let created = 0
  const cache = new SessionViewportCache((sessionId, onViewUnavailable) => {
    created += 1
    missing.set(sessionId, onViewUnavailable)
    return {
      dispose: () => {
        disposed.push(sessionId)
      },
    } as unknown as SessionViewController
  })
  const deleted = route("deleted")
  cache.register(deleted)
  cache.register(route("healthy"))
  const release = cache.retainOwner(
    cache.getSnapshot().get("deleted")!.controller
  )
  missing.get("deleted")!("Session not found.")

  assert.equal(cache.getSnapshot().has("deleted"), false)
  assert.equal(cache.getSnapshot().has("healthy"), true)
  assert.equal(
    cache.getUnavailable("deleted", null)?.message,
    "Session not found."
  )
  assert.deepEqual(disposed, [])
  assert.equal(cache.register(deleted), false)
  assert.equal(created, 2)
  release()
  assert.deepEqual(disposed, ["deleted"])
  assert.equal(cache.register(route("deleted", "new-identity")), true)
  assert.equal(cache.getUnavailable("deleted", null), null)
  assert.equal(created, 3)
  cache.dispose()
})

test("unavailable tombstones stay bounded across deleted conversations", () => {
  const callbacks = new Map<string, (message: string) => void>()
  const cache = new SessionViewportCache((sessionId, onViewUnavailable) => {
    callbacks.set(sessionId, onViewUnavailable)
    return { dispose() {} } as unknown as SessionViewController
  })
  for (let index = 0; index <= MAX_RETAINED_SESSION_VIEWPORTS; index++) {
    const id = `deleted-${index}`
    cache.register(route(id))
    callbacks.get(id)!("Session not found.")
  }
  assert.equal(cache.getUnavailable("deleted-0", null), null)
  assert.equal(
    cache.getUnavailable(`deleted-${MAX_RETAINED_SESSION_VIEWPORTS}`, null)
      ?.message,
    "Session not found."
  )
  cache.dispose()
})
