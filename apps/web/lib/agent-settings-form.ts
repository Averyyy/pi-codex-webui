import type {
  AgentSettings,
  AgentSettingsSnapshot,
} from "@workspace/runtime-protocol"

export function globalAgentSettings(
  snapshot: AgentSettingsSnapshot
): AgentSettings {
  const { defaults, global } = snapshot
  return {
    ...defaults,
    ...global,
    codemode: { ...defaults.codemode, ...global.codemode },
    compaction: { ...defaults.compaction, ...global.compaction },
    retry: {
      ...defaults.retry,
      ...global.retry,
      provider: {
        ...defaults.retry?.provider,
        timeoutMs: global.httpIdleTimeoutMs ?? defaults.httpIdleTimeoutMs,
        ...global.retry?.provider,
      },
    },
    images: { ...defaults.images, ...global.images },
  }
}

export function codemodeToolSelection(
  selection: string[] | undefined,
  enabled: boolean
) {
  if (
    selection &&
    (selection.length === 0 ||
      selection.some((name) => !name.startsWith("+") && !name.startsWith("-")))
  ) {
    const tools = selection.filter(
      (name) =>
        !name.startsWith("+") && !name.startsWith("-") && name !== "codemode"
    )
    for (const entry of selection) {
      const name = entry.slice(1)
      if (name === "codemode") continue
      if (entry.startsWith("+") && !tools.includes(name)) tools.push(name)
      if (entry.startsWith("-")) {
        const index = tools.indexOf(name)
        if (index !== -1) tools.splice(index, 1)
      }
    }
    if (enabled) tools.push("codemode")
    return tools
  }
  return [
    ...(selection ?? []).filter(
      (name) => !["codemode", "+codemode", "-codemode"].includes(name)
    ),
    enabled ? "+codemode" : "-codemode",
  ]
}

export function codemodeIsEnabled(selection: string[]) {
  let enabled = selection.some((name) => name === "codemode")
  for (const name of selection) {
    if (name === "+codemode") enabled = true
    if (name === "-codemode") enabled = false
  }
  return enabled
}

export function agentSettingsPatch(
  saved: AgentSettings,
  draft: AgentSettings
): AgentSettings {
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) =>
        JSON.stringify(value) !==
        JSON.stringify(saved[key as keyof AgentSettings])
    )
  )
}
