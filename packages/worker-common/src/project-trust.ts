import type { CodingAgentModule } from "./coding-agent.js"
import { createSettingsManager } from "./settings.js"

/** Resolve project trust using the same headless policy used by runtime workers. */
export function projectTrustedForWeb(
  codingAgent: CodingAgentModule,
  cwd: string,
  agentDir: string
) {
  if (!codingAgent.hasTrustRequiringProjectResources(cwd)) return true
  const stored = new codingAgent.ProjectTrustStore(agentDir).get(cwd)
  if (stored !== null) return stored
  const globalSettings = createSettingsManager(
    codingAgent,
    cwd,
    agentDir,
    false
  )
  return globalSettings.getDefaultProjectTrust() === "always"
}
