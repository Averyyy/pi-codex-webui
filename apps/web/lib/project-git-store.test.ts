import assert from "node:assert/strict"
import test from "node:test"

import { getProjectGitStatusStore } from "./project-git-status-store"

class FakeEventSource {
  closed = false
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.closed = true
  }
}

test("only the current project retains a Git event transport", async () => {
  const originalFetch = globalThis.fetch
  const sources: FakeEventSource[] = []
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ branch: null, changes: [] }))) as typeof fetch

  const createEventSource = () => {
    const source = new FakeEventSource()
    sources.push(source)
    return source as unknown as EventSource
  }
  const first = getProjectGitStatusStore("project-a", null, createEventSource)
  const second = getProjectGitStatusStore("project-b", null, createEventSource)

  try {
    first.retain()
    second.retain()

    assert.equal(sources.length, 2)
    assert.equal(sources[0]!.closed, true)
    assert.equal(sources[1]!.closed, false)
    assert.equal(sources.filter((source) => !source.closed).length, 1)
    await new Promise<void>((resolve) => setImmediate(resolve))
  } finally {
    first.dispose()
    second.dispose()
    globalThis.fetch = originalFetch
  }
})
