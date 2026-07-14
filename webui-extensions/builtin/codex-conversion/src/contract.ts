export const CODEX_QUICK_ACTIONS = [
  {
    command: "fast",
    label: "Toggle fast mode",
    description: "Use the Extension's original fast-mode command.",
  },
  {
    command: "all",
    label: "Cycle provider scope",
    description: "Cycle off, all providers, and extra providers only.",
  },
  {
    command: "status",
    label: "Toggle status line",
    description: "Show or hide Codex state in Pi's status line.",
  },
  {
    command: "low",
    label: "Low verbosity",
    description: "Set OpenAI response verbosity to low.",
  },
  {
    command: "medium",
    label: "Medium verbosity",
    description: "Set OpenAI response verbosity to medium.",
  },
  {
    command: "high",
    label: "High verbosity",
    description: "Set OpenAI response verbosity to high.",
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
