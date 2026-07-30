import assert from "node:assert/strict"
import test from "node:test"

import { defineClientExtension, defineWorkerExtension } from "./index.js"
import {
  loadClientExtensionForTest,
  loadWorkerExtensionForTest,
} from "./testing.js"

test("testing harness collects worker and client registrations", async () => {
  const worker = await loadWorkerExtensionForTest(
    defineWorkerExtension((web) => {
      web.registerCommandAdapter({
        id: "example.open",
        handle: () => ({ handled: true }),
      })
      web.registerToolExecutionAdapter({
        id: "example.execute",
        execute: () => ({ handled: false }),
      })
    })
  )
  const client = await loadClientExtensionForTest(
    defineClientExtension((web) => {
      web.registerView({
        id: "example.view",
        mount: () => ({ dispose() {} }),
      })
    })
  )
  assert.equal(worker.commands.has("example.open"), true)
  assert.equal(worker.toolExecutions.has("example.execute"), true)
  assert.equal(client.views.has("example.view"), true)
})
