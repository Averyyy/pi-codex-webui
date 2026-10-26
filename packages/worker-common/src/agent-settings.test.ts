import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import type { CodingAgentModule } from "./coding-agent.js"
import { handleAgentSettingsMessage } from "./agent-settings.js"
import { createSettingsManager } from "./settings.js"

for (const worker of ["worker-pi", "worker-pi-client"]) {
  test(`${worker}: agent settings preserve native defaults, project scope, and unrelated configuration`, async () => {
    const codingAgent: CodingAgentModule = await import(
      pathToFileURL(
        path.resolve(
          `packages/${worker}/node_modules/@earendil-works/pi-coding-agent/dist/index.js`
        )
      ).href
    )
    const root = await mkdtemp(path.join(tmpdir(), "pi-web-agent-settings-"))
    const cwd = path.join(root, "project")
    const agentDir = path.join(root, "agent")
    try {
      await mkdir(path.join(cwd, codingAgent.CONFIG_DIR_NAME), {
        recursive: true,
      })
      await mkdir(agentDir)
      const payload = { cwd, agentDir }
      const initial = await handleAgentSettingsMessage(codingAgent, {
        type: "agent-settings.get",
        requestId: "read",
        payload,
      })
      assert.equal(initial.defaults.cacheWarming, "streaming")
      assert.equal(initial.defaults.codemode?.inlineBudget, 3000)
      assert.equal(initial.defaults.retry?.provider?.maxRetries, 0)
      assert.equal(initial.defaults.retry?.provider?.timeoutMs, 300000)
      assert.equal(initial.defaults.compaction?.reserveTokens, 16384)
      assert.deepEqual(initial.defaults.defaultTools, [
        "read",
        "bash",
        "edit",
        "write",
        "codemode",
      ])
      await writeFile(
        path.join(agentDir, "settings.json"),
        JSON.stringify({
          theme: "dark",
          trackingId: "fixture",
          extensions: ["./extension.ts"],
          retry: { provider: { customValue: "preserve" } },
        })
      )
      await writeFile(
        path.join(cwd, codingAgent.CONFIG_DIR_NAME, "settings.json"),
        JSON.stringify({
          compaction: { keepRecentTokens: 1000 },
          cacheWarming: "off",
        })
      )
      new codingAgent.ProjectTrustStore(agentDir).set(cwd, true)
      const before = await handleAgentSettingsMessage(codingAgent, {
        type: "agent-settings.get",
        requestId: "before",
        payload,
      })
      const saved = await handleAgentSettingsMessage(codingAgent, {
        type: "agent-settings.set",
        requestId: "save",
        payload: {
          ...payload,
          expected: before.global,
          settings: {
            cacheWarming: "idle",
            defaultTools: ["-bash", "+powershell", "+codemode"],
            codemode: { mode: "only", inlineBudget: 4000 },
            defaultThinkingLevel: "high",
            modelThinkingLevels: { "openai/model": "max" },
            retry: { provider: { maxRetries: 1 } },
            compaction: {
              keepRecentTokens: 15000,
              modelOverrides: { "openai/model": { reserveTokens: 5000 } },
            },
          },
        },
      })
      assert.equal(saved.global.cacheWarming, "idle")
      assert.equal(saved.effective.cacheWarming, "idle")
      assert.equal(saved.effective.compaction?.keepRecentTokens, 1000)
      assert.equal(saved.project.compaction?.keepRecentTokens, 1000)
      const native = createSettingsManager(codingAgent, cwd, agentDir, true)
      assert.equal(native.getDefaultThinkingLevel(), "high")
      assert.equal(native.getModelThinkingLevel("openai", "model"), "max")
      assert.deepEqual(native.getDefaultTools(), [
        "read",
        "edit",
        "write",
        "powershell",
        "codemode",
      ])
      assert.deepEqual(
        native.getCompactionSettings({ provider: "openai", id: "model" }),
        { enabled: true, reserveTokens: 5000, keepRecentTokens: 1000 }
      )
      const persisted = JSON.parse(
        await readFile(path.join(agentDir, "settings.json"), "utf8")
      )
      assert.equal(persisted.theme, "dark")
      assert.equal(persisted.trackingId, "fixture")
      assert.deepEqual(persisted.extensions, ["./extension.ts"])
      assert.equal(persisted.retry.provider.customValue, "preserve")
      await assert.rejects(
        handleAgentSettingsMessage(codingAgent, {
          type: "agent-settings.set",
          requestId: "conflict",
          payload: {
            ...payload,
            expected: before.global,
            settings: { cacheWarming: "off" },
          },
        }),
        (error: unknown) =>
          (error as { code: string }).code === "AgentSettingsConflict"
      )
      assert.equal(
        JSON.parse(await readFile(path.join(agentDir, "settings.json"), "utf8"))
          .cacheWarming,
        "idle"
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
