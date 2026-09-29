import assert from "node:assert/strict"
import test, { mock } from "node:test"

import { SESSION_CATALOG_CHANGED } from "./session-catalog-events"
import { refreshProjectSessions } from "./project-session-refresh"

test("project refresh publishes only project and pinned catalog changes after a valid response", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const events: { scope: string; projectId?: string }[] = []
  const eventTarget = new EventTarget()
  eventTarget.addEventListener(SESSION_CATALOG_CHANGED, (event) => {
    events.push((event as CustomEvent).detail)
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: eventTarget,
  })
  let response: unknown = {
    projectId: "project/a",
    failures: [],
  }
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    Response.json(response)
  )
  try {
    assert.deepEqual(
      await refreshProjectSessions("project/a", "token"),
      response
    )
    const [url, options] = fetchMock.mock.calls[0]!.arguments as [
      string,
      RequestInit,
    ]
    assert.equal(url, "/api/v1/projects/project%2Fa/sessions/refresh")
    assert.equal(options.method, "POST")
    assert.equal(
      new Headers(options.headers).get("X-Pi-Web-Codex-Mutation-Token"),
      "token"
    )
    assert.deepEqual(events, [
      { scope: "project", projectId: "project/a" },
      { scope: "pinned" },
    ])

    response = null
    await assert.rejects(refreshProjectSessions("project/a", "token"))
    response = { projectId: "project/a", failures: [null] }
    await assert.rejects(
      refreshProjectSessions("project/a", "token"),
      /Invalid project conversation refresh response/
    )
    assert.equal(events.length, 2)
  } finally {
    fetchMock.mock.restore()
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow)
    } else {
      Reflect.deleteProperty(globalThis, "window")
    }
  }
})
