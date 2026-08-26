export const CODEX_QUICK_ACTIONS = [
  {
    command: "tools",
    label: "Tools",
    description: "Codex-compatible tools and execution modes.",
  },
  {
    command: "openai",
    label: "OpenAI",
    description: "OpenAI provider and response settings.",
  },
  {
    command: "display",
    label: "Display",
    description: "Status and tool rendering preferences.",
  },
  {
    command: "voice",
    label: "Voice",
    description: "Realtime voice and dictation settings.",
  },
  {
    command: "usage",
    label: "Usage",
    description: "Current Codex usage details.",
  },
  {
    command: "about",
    label: "About",
    description: "Extension version and diagnostics.",
  },
] as const

export type CodexQuickCommand = (typeof CODEX_QUICK_ACTIONS)[number]["command"]

export interface CodexQuickSettingsState {
  actions: typeof CODEX_QUICK_ACTIONS
}

export type CodexQuickSettingsResult =
  { command: CodexQuickCommand } | { cancelled: true }

export function parseCodexQuickSettingsState(
  value: unknown
): CodexQuickSettingsState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("actions" in value) ||
    !Array.isArray(value.actions) ||
    value.actions.length !== CODEX_QUICK_ACTIONS.length ||
    value.actions.some((action, index) => {
      const expected = CODEX_QUICK_ACTIONS[index]
      if (!expected) return true
      return (
        typeof action !== "object" ||
        action === null ||
        !("command" in action) ||
        action.command !== expected.command ||
        !("label" in action) ||
        action.label !== expected.label ||
        !("description" in action) ||
        action.description !== expected.description
      )
    })
  ) {
    throw new TypeError("Invalid Codex quick-settings state.")
  }
  return value as CodexQuickSettingsState
}

export function parseCodexQuickSettingsResult(
  value: unknown
): CodexQuickSettingsResult {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Invalid Codex quick-settings result.")
  }
  if ("cancelled" in value && value.cancelled === true) {
    return { cancelled: true }
  }
  const command = "command" in value ? value.command : undefined
  if (
    typeof command === "string" &&
    CODEX_QUICK_ACTIONS.some((action) => action.command === command)
  ) {
    return { command: command as CodexQuickCommand }
  }
  throw new TypeError("Invalid Codex quick-settings result.")
}
