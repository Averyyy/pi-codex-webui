import { isDeepStrictEqual } from "node:util"
import stripJsonComments from "strip-json-comments"
import type { SettingsManager } from "@earendil-works/pi-coding-agent"
import {
  agentSettingsSchema,
  type AgentSettings,
  type AgentSettingsSnapshot,
  type HostToWorkerMessage,
} from "@workspace/runtime-protocol"

import type { CodingAgentModule } from "./coding-agent.js"
import { AtomicSettingsStorage, createSettingsManager } from "./settings.js"
import { projectTrustedForWeb } from "./project-trust.js"

type AgentSettingsMessage = Extract<
  HostToWorkerMessage,
  { type: "agent-settings.get" | "agent-settings.set" }
>

export function resolvedAgentSettings(manager: SettingsManager): AgentSettings {
  const settings = manager.getSettings()
  const providerRetry = manager.getProviderRetrySettings()
  return {
    defaultThinkingLevel: manager.getDefaultThinkingLevel() ?? "medium",
    modelThinkingLevels: manager.getAllModelThinkingLevels(),
    defaultTools: manager.getDefaultTools() ?? [
      "read",
      "bash",
      "edit",
      "write",
    ],
    codemode: {
      mode: settings.codemode?.mode ?? "on",
      inlineBudget: settings.codemode?.inlineBudget ?? 3000,
    },
    cacheWarming: manager.getCacheWarmingMode(),
    transport: manager.getTransport(),
    httpIdleTimeoutMs: manager.getHttpIdleTimeoutMs(),
    websocketConnectTimeoutMs: manager.getWebSocketConnectTimeoutMs() ?? 15000,
    compaction: {
      ...manager.getCompactionSettings(),
      modelOverrides: settings.compaction?.modelOverrides ?? {},
    },
    retry: {
      ...manager.getRetrySettings(),
      provider: {
        timeoutMs: providerRetry.timeoutMs ?? manager.getHttpIdleTimeoutMs(),
        maxRetries: providerRetry.maxRetries ?? 0,
        maxRetryDelayMs: providerRetry.maxRetryDelayMs,
      },
    },
    steeringMode: manager.getSteeringMode(),
    followUpMode: manager.getFollowUpMode(),
    images: {
      autoResize: manager.getImageAutoResize(),
      blockImages: manager.getBlockImages(),
    },
  }
}

export function mergeAgentSettings(
  current: Record<string, unknown>,
  patch: AgentSettings
): Record<string, unknown> {
  const merged = { ...current, ...patch }
  for (const key of ["codemode", "compaction", "retry", "images"] as const) {
    if (patch[key])
      merged[key] = { ...(current[key] as object | undefined), ...patch[key] }
  }
  if (patch.retry?.provider) {
    const currentRetry = current.retry as AgentSettings["retry"]
    merged.retry = {
      ...(merged.retry as object),
      provider: { ...currentRetry?.provider, ...patch.retry.provider },
    }
  }
  return merged
}

function snapshot(
  codingAgent: CodingAgentModule,
  manager: SettingsManager
): AgentSettingsSnapshot {
  return {
    global: agentSettingsSchema.parse(manager.getGlobalSettings()),
    defaults: resolvedAgentSettings(codingAgent.SettingsManager.inMemory()),
    effective: resolvedAgentSettings(manager),
    project: manager.isProjectTrusted()
      ? agentSettingsSchema.parse(manager.getProjectSettings())
      : {},
    projectTrusted: manager.isProjectTrusted(),
  }
}

export async function handleAgentSettingsMessage(
  codingAgent: CodingAgentModule,
  message: AgentSettingsMessage
) {
  const { cwd, agentDir } = message.payload
  const trusted = projectTrustedForWeb(codingAgent, cwd, agentDir)
  const manager = createSettingsManager(codingAgent, cwd, agentDir, trusted)
  const errors = manager.drainErrors()
  if (errors.length) throw errors[0]!.error
  if (message.type === "agent-settings.set") {
    const storage = new AtomicSettingsStorage(codingAgent, cwd, agentDir)
    storage.withLock("global", (source) => {
      const current =
        source === undefined
          ? {}
          : (JSON.parse(stripJsonComments(source)) as Record<string, unknown>)
      if (
        !isDeepStrictEqual(
          agentSettingsSchema.parse(current),
          message.payload.expected
        )
      ) {
        throw Object.assign(
          new Error("Agent settings changed. Reload settings before saving."),
          { code: "AgentSettingsConflict" }
        )
      }
      return (
        JSON.stringify(
          mergeAgentSettings(current, message.payload.settings),
          null,
          2
        ) + "\n"
      )
    })
    await manager.reload()
    const reloadErrors = manager.drainErrors()
    if (reloadErrors.length) throw reloadErrors[0]!.error
  }
  return snapshot(codingAgent, manager)
}
