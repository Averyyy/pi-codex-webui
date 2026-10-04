import assert from "node:assert/strict"
import test from "node:test"
import {
  agentSettingsSchema,
  type AgentSettingsSnapshot,
} from "@workspace/runtime-protocol"
import {
  agentSettingsPatch,
  codemodeIsEnabled,
  codemodeToolSelection,
  globalAgentSettings,
} from "./agent-settings-form"

test("Codemode selection preserves the startup tool expression and follows ordered modifiers", () => {
  assert.deepEqual(
    codemodeToolSelection(
      ["-bash", "+powershell", "+codemode", "+grep"],
      false
    ),
    ["-bash", "+powershell", "+grep", "-codemode"]
  )
  assert.deepEqual(codemodeToolSelection(undefined, true), ["+codemode"])
  assert.deepEqual(codemodeToolSelection([], true), ["codemode"])
  assert.deepEqual(codemodeToolSelection(["codemode"], false), [])
  assert.deepEqual(codemodeToolSelection(["codemode", "+grep"], false), [
    "grep",
  ])
  assert.equal(codemodeIsEnabled(["+codemode", "-codemode"]), false)
  assert.equal(codemodeIsEnabled(["-codemode", "+codemode"]), true)
  assert.equal(codemodeIsEnabled(["codemode"]), true)
})

test("global controls do not display trusted project overrides as global settings", () => {
  const snapshot: AgentSettingsSnapshot = {
    global: {
      httpIdleTimeoutMs: 120000,
      compaction: { keepRecentTokens: 9000 },
    },
    defaults: {
      httpIdleTimeoutMs: 300000,
      retry: { provider: { timeoutMs: 300000, maxRetries: 0 } },
      compaction: { keepRecentTokens: 20000, reserveTokens: 16384 },
    },
    effective: { compaction: { keepRecentTokens: 1000 } },
    project: { compaction: { keepRecentTokens: 1000 } },
    projectTrusted: true,
  }
  const values = globalAgentSettings(snapshot)
  assert.equal(values.compaction?.keepRecentTokens, 9000)
  assert.equal(values.compaction?.reserveTokens, 16384)
  assert.equal(values.retry?.provider?.timeoutMs, 120000)
  assert.deepEqual(
    agentSettingsPatch(values, { ...values, cacheWarming: "idle" }),
    { cacheWarming: "idle" }
  )
})

test("agent settings reject malformed per-model compaction and unsupported modes", () => {
  assert.equal(
    agentSettingsSchema.safeParse({
      compaction: { modelOverrides: { "openai/model": { reserveTokens: -1 } } },
    }).success,
    false
  )
  assert.equal(
    agentSettingsSchema.safeParse({
      modelThinkingLevels: { "openai/model": "ultra" },
    }).success,
    false
  )
  assert.equal(
    agentSettingsSchema.safeParse({ codemode: { mode: "auto" } }).success,
    false
  )
})
