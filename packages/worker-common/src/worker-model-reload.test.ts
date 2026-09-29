import assert from "node:assert/strict"
import test from "node:test"

import type { AgentSession } from "@earendil-works/pi-coding-agent"

import type { CodingAgentModule } from "./coding-agent.js"
import { reloadModelSettings } from "./worker.js"

test("runtime model reload applies local settings without provider discovery", async () => {
  const events: string[] = []
  let enabledModels = ["old-provider/old-model"]
  const scopedModels = [
    { model: { provider: "local", id: "new-model" } },
  ] as Parameters<AgentSession["setScopedModels"]>[0]

  const services = {
    settingsManager: {
      async reload() {
        events.push("settings reloaded")
        enabledModels = ["local/new-model"]
      },
      getEnabledModels: () => enabledModels,
    },
    modelRuntime: {
      async refresh(options: { force?: boolean; allowNetwork?: boolean }) {
        assert.deepEqual(options, { force: true, allowNetwork: false })
        events.push("local models refreshed")
      },
    },
  } as unknown as Parameters<typeof reloadModelSettings>[1]
  const agent = {
    async resolveModelScopeWithDiagnostics(patterns: string[]) {
      assert.deepEqual(patterns, ["local/new-model"])
      assert.deepEqual(events, ["settings reloaded", "local models refreshed"])
      return { scopedModels, diagnostics: [] }
    },
  } as unknown as CodingAgentModule
  const session = {
    setScopedModels(models: typeof scopedModels) {
      assert.equal(models, scopedModels)
      events.push("session scope updated")
    },
  } as unknown as AgentSession

  await reloadModelSettings(session, services, agent)

  assert.deepEqual(events, [
    "settings reloaded",
    "local models refreshed",
    "session scope updated",
  ])
})
