import type { MessageKey } from "./i18n"

export const shortcutCategories = [
  "conversation",
  "navigation",
  "workspace",
  "composer",
  "settings",
] as const

export type ShortcutCategory = (typeof shortcutCategories)[number]

export const shortcutCommandIds = [
  "conversation.new",
  "conversation.newIndependent",
  "conversation.archive",
  "conversation.togglePin",
  "conversation.rename",
  "conversation.continue",
  "conversation.copyPath",
  "conversation.copyDeepLink",
  "conversation.copyId",
  "conversation.copyWorkingDirectory",
  "navigation.back",
  "navigation.forward",
  "navigation.nextConversation",
  "navigation.previousConversation",
  "navigation.switchConversation",
  "navigation.conversation1",
  "navigation.conversation2",
  "navigation.conversation3",
  "navigation.conversation4",
  "navigation.conversation5",
  "navigation.conversation6",
  "navigation.conversation7",
  "navigation.conversation8",
  "navigation.conversation9",
  "workspace.toggleSidebar",
  "workspace.openReview",
  "workspace.toggleReview",
  "workspace.toggleBottomPanel",
  "workspace.openTerminal",
  "workspace.openFileTree",
  "workspace.openFolder",
  "composer.attachPhoto",
  "composer.cycleReasoning",
  "composer.decreaseReasoning",
  "composer.increaseReasoning",
  "composer.openModelSelector",
  "composer.openProjectSelector",
  "composer.send",
  "composer.openCommandMenu",
  "settings.open",
  "settings.shortcuts",
  "settings.skills",
  "settings.mcp",
] as const

export type ShortcutCommandId = (typeof shortcutCommandIds)[number]
export type ShortcutOverrides = Partial<Record<ShortcutCommandId, string[]>>

export interface ShortcutCommand {
  id: ShortcutCommandId
  category: ShortcutCategory
  labelKey: MessageKey
  descriptionKey: MessageKey
  defaultBindings: readonly string[]
}

const conversationNumberCommands = Array.from({ length: 9 }, (_, index) => {
  const number = index + 1
  return {
    id: `navigation.conversation${number}` as ShortcutCommandId,
    category: "navigation" as const,
    labelKey: `shortcuts.command.conversation${number}.label` as MessageKey,
    descriptionKey:
      `shortcuts.command.conversationNumber.description` as MessageKey,
    defaultBindings: [`Mod+Digit${number}`],
  }
})

export const shortcutCommands: readonly ShortcutCommand[] = [
  {
    id: "conversation.new",
    category: "conversation",
    labelKey: "shortcuts.command.new.label",
    descriptionKey: "shortcuts.command.new.description",
    defaultBindings: ["Mod+KeyN", "Mod+Shift+KeyO"],
  },
  {
    id: "conversation.newIndependent",
    category: "conversation",
    labelKey: "shortcuts.command.newIndependent.label",
    descriptionKey: "shortcuts.command.newIndependent.description",
    defaultBindings: ["Mod+Alt+KeyO"],
  },
  {
    id: "conversation.archive",
    category: "conversation",
    labelKey: "shortcuts.command.archive.label",
    descriptionKey: "shortcuts.command.archive.description",
    defaultBindings: ["Mod+Shift+KeyA"],
  },
  {
    id: "conversation.togglePin",
    category: "conversation",
    labelKey: "shortcuts.command.togglePin.label",
    descriptionKey: "shortcuts.command.togglePin.description",
    defaultBindings: ["Mod+Alt+KeyP"],
  },
  {
    id: "conversation.rename",
    category: "conversation",
    labelKey: "shortcuts.command.rename.label",
    descriptionKey: "shortcuts.command.rename.description",
    defaultBindings: ["Mod+Alt+KeyR"],
  },
  {
    id: "conversation.continue",
    category: "conversation",
    labelKey: "shortcuts.command.continue.label",
    descriptionKey: "shortcuts.command.continue.description",
    defaultBindings: [],
  },
  {
    id: "conversation.copyPath",
    category: "conversation",
    labelKey: "shortcuts.command.copyPath.label",
    descriptionKey: "shortcuts.command.copyPath.description",
    defaultBindings: ["Mod+Alt+Shift+KeyC"],
  },
  {
    id: "conversation.copyDeepLink",
    category: "conversation",
    labelKey: "shortcuts.command.copyDeepLink.label",
    descriptionKey: "shortcuts.command.copyDeepLink.description",
    defaultBindings: ["Mod+Alt+KeyL"],
  },
  {
    id: "conversation.copyId",
    category: "conversation",
    labelKey: "shortcuts.command.copyId.label",
    descriptionKey: "shortcuts.command.copyId.description",
    defaultBindings: ["Mod+Alt+KeyC"],
  },
  {
    id: "conversation.copyWorkingDirectory",
    category: "conversation",
    labelKey: "shortcuts.command.copyWorkingDirectory.label",
    descriptionKey: "shortcuts.command.copyWorkingDirectory.description",
    defaultBindings: ["Mod+Shift+KeyC"],
  },
  {
    id: "navigation.back",
    category: "navigation",
    labelKey: "shortcuts.command.back.label",
    descriptionKey: "shortcuts.command.back.description",
    defaultBindings: ["Mod+BracketLeft"],
  },
  {
    id: "navigation.forward",
    category: "navigation",
    labelKey: "shortcuts.command.forward.label",
    descriptionKey: "shortcuts.command.forward.description",
    defaultBindings: ["Mod+BracketRight"],
  },
  {
    id: "navigation.nextConversation",
    category: "navigation",
    labelKey: "shortcuts.command.nextConversation.label",
    descriptionKey: "shortcuts.command.nextConversation.description",
    defaultBindings: [
      "Control+Tab",
      "Mod+Shift+BracketRight",
      "Mod+Alt+ArrowRight",
    ],
  },
  {
    id: "navigation.previousConversation",
    category: "navigation",
    labelKey: "shortcuts.command.previousConversation.label",
    descriptionKey: "shortcuts.command.previousConversation.description",
    defaultBindings: [
      "Control+Shift+Tab",
      "Mod+Shift+BracketLeft",
      "Mod+Alt+ArrowLeft",
    ],
  },
  {
    id: "navigation.switchConversation",
    category: "navigation",
    labelKey: "shortcuts.command.switchConversation.label",
    descriptionKey: "shortcuts.command.switchConversation.description",
    defaultBindings: [],
  },
  ...conversationNumberCommands,
  {
    id: "workspace.toggleSidebar",
    category: "workspace",
    labelKey: "shortcuts.command.toggleSidebar.label",
    descriptionKey: "shortcuts.command.toggleSidebar.description",
    defaultBindings: ["Mod+KeyB"],
  },
  {
    id: "workspace.openReview",
    category: "workspace",
    labelKey: "shortcuts.command.openReview.label",
    descriptionKey: "shortcuts.command.openReview.description",
    defaultBindings: ["Control+Shift+KeyG"],
  },
  {
    id: "workspace.toggleReview",
    category: "workspace",
    labelKey: "shortcuts.command.toggleReview.label",
    descriptionKey: "shortcuts.command.toggleReview.description",
    defaultBindings: ["Mod+Alt+KeyB"],
  },
  {
    id: "workspace.toggleBottomPanel",
    category: "workspace",
    labelKey: "shortcuts.command.toggleBottomPanel.label",
    descriptionKey: "shortcuts.command.toggleBottomPanel.description",
    defaultBindings: ["Mod+KeyJ"],
  },
  {
    id: "workspace.openTerminal",
    category: "workspace",
    labelKey: "shortcuts.command.openTerminal.label",
    descriptionKey: "shortcuts.command.openTerminal.description",
    defaultBindings: ["Control+Backquote"],
  },
  {
    id: "workspace.openFileTree",
    category: "workspace",
    labelKey: "shortcuts.command.openFileTree.label",
    descriptionKey: "shortcuts.command.openFileTree.description",
    defaultBindings: ["Mod+Shift+KeyE"],
  },
  {
    id: "workspace.openFolder",
    category: "workspace",
    labelKey: "shortcuts.command.openFolder.label",
    descriptionKey: "shortcuts.command.openFolder.description",
    defaultBindings: ["Mod+KeyO"],
  },
  {
    id: "composer.attachPhoto",
    category: "composer",
    labelKey: "shortcuts.command.attachPhoto.label",
    descriptionKey: "shortcuts.command.attachPhoto.description",
    defaultBindings: [],
  },
  {
    id: "composer.cycleReasoning",
    category: "composer",
    labelKey: "shortcuts.command.cycleReasoning.label",
    descriptionKey: "shortcuts.command.cycleReasoning.description",
    defaultBindings: ["Shift+Tab"],
  },
  {
    id: "composer.decreaseReasoning",
    category: "composer",
    labelKey: "shortcuts.command.decreaseReasoning.label",
    descriptionKey: "shortcuts.command.decreaseReasoning.description",
    defaultBindings: [],
  },
  {
    id: "composer.increaseReasoning",
    category: "composer",
    labelKey: "shortcuts.command.increaseReasoning.label",
    descriptionKey: "shortcuts.command.increaseReasoning.description",
    defaultBindings: [],
  },
  {
    id: "composer.openModelSelector",
    category: "composer",
    labelKey: "shortcuts.command.openModelSelector.label",
    descriptionKey: "shortcuts.command.openModelSelector.description",
    defaultBindings: ["Control+Shift+KeyM"],
  },
  {
    id: "composer.openProjectSelector",
    category: "composer",
    labelKey: "shortcuts.command.openProjectSelector.label",
    descriptionKey: "shortcuts.command.openProjectSelector.description",
    defaultBindings: ["Mod+Alt+Shift+KeyO"],
  },
  {
    id: "composer.send",
    category: "composer",
    labelKey: "shortcuts.command.send.label",
    descriptionKey: "shortcuts.command.send.description",
    defaultBindings: [],
  },
  {
    id: "composer.openCommandMenu",
    category: "composer",
    labelKey: "shortcuts.command.openCommandMenu.label",
    descriptionKey: "shortcuts.command.openCommandMenu.description",
    defaultBindings: ["Mod+KeyK", "Mod+Shift+KeyP"],
  },
  {
    id: "settings.open",
    category: "settings",
    labelKey: "shortcuts.command.settings.label",
    descriptionKey: "shortcuts.command.settings.description",
    defaultBindings: ["Mod+Comma"],
  },
  {
    id: "settings.shortcuts",
    category: "settings",
    labelKey: "shortcuts.command.shortcuts.label",
    descriptionKey: "shortcuts.command.shortcuts.description",
    defaultBindings: ["Mod+Slash"],
  },
  {
    id: "settings.skills",
    category: "settings",
    labelKey: "shortcuts.command.skills.label",
    descriptionKey: "shortcuts.command.skills.description",
    defaultBindings: [],
  },
  {
    id: "settings.mcp",
    category: "settings",
    labelKey: "shortcuts.command.mcp.label",
    descriptionKey: "shortcuts.command.mcp.description",
    defaultBindings: [],
  },
]

const commandById = new Map(
  shortcutCommands.map((command) => [command.id, command])
)
const commandIds = new Set<string>(shortcutCommandIds)

export function shortcutCommand(id: ShortcutCommandId) {
  const command = commandById.get(id)
  if (!command) throw new Error(`Unknown shortcut command: ${id}`)
  return command
}

export function effectiveShortcutBindings(
  overrides: ShortcutOverrides,
  commandId: ShortcutCommandId
) {
  return overrides[commandId] ?? [...shortcutCommand(commandId).defaultBindings]
}

export function normalizeShortcutOverrides(value: unknown): ShortcutOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  const result: ShortcutOverrides = {}
  for (const [commandId, bindings] of Object.entries(value)) {
    if (
      !commandIds.has(commandId) ||
      !Array.isArray(bindings) ||
      bindings.some((binding) => !isShortcutBinding(binding)) ||
      new Set(bindings).size !== bindings.length
    ) {
      continue
    }
    result[commandId as ShortcutCommandId] = [...bindings]
  }
  return result
}

const modifierTokens = new Set(["Mod", "Control", "Alt", "Shift"])
const keyCodePattern =
  /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Bracket(?:Left|Right)|Backquote|Comma|Slash|Period|Semicolon|Quote|Minus|Equal|Backslash|Tab|Enter|Space|Backspace|Delete|Home|End|PageUp|PageDown)$/

export function isShortcutBinding(value: unknown): value is string {
  if (typeof value !== "string") return false
  const tokens = value.split("+")
  const key = tokens.at(-1)
  const modifiers = tokens.slice(0, -1)
  return (
    !!key &&
    keyCodePattern.test(key) &&
    modifiers.every((modifier) => modifierTokens.has(modifier)) &&
    new Set(modifiers).size === modifiers.length &&
    (modifiers.length > 0 || /^F(?:[1-9]|1[0-2])$/.test(key))
  )
}

function applePlatform(platform: string) {
  return /darwin|Mac|iPhone|iPad|iPod/.test(platform)
}

function bindingParts(binding: string) {
  const tokens = binding.split("+")
  return {
    modifiers: new Set(tokens.slice(0, -1)),
    code: tokens.at(-1)!,
  }
}

export function shortcutMatchesEvent(
  binding: string,
  event: Pick<
    KeyboardEvent,
    "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
  >,
  platform: string
) {
  if (!isShortcutBinding(binding)) return false
  const { modifiers, code } = bindingParts(binding)
  const apple = applePlatform(platform)
  const primaryPressed = apple ? event.metaKey : event.ctrlKey
  const controlPressed = event.ctrlKey
  const expectsPrimary = modifiers.has("Mod")
  const expectsControl = modifiers.has("Control")

  return (
    event.code === code &&
    (apple
      ? primaryPressed === expectsPrimary && controlPressed === expectsControl
      : controlPressed === (expectsPrimary || expectsControl)) &&
    event.metaKey === (apple ? expectsPrimary : false) &&
    event.altKey === modifiers.has("Alt") &&
    event.shiftKey === modifiers.has("Shift")
  )
}

export function shortcutFromKeyboardEvent(
  event: Pick<
    KeyboardEvent,
    "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
  >,
  platform: string
) {
  if (!keyCodePattern.test(event.code)) return null
  const modifiers: string[] = []
  const apple = applePlatform(platform)
  if (apple ? event.metaKey : event.ctrlKey) modifiers.push("Mod")
  if (apple && event.ctrlKey) modifiers.push("Control")
  if (event.altKey) modifiers.push("Alt")
  if (event.shiftKey) modifiers.push("Shift")
  const binding = [...modifiers, event.code].join("+")
  return isShortcutBinding(binding) ? binding : null
}

const displayKeys: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Comma: ",",
  Slash: "/",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Minus: "-",
  Equal: "=",
  Backslash: "\\",
  Space: "Space",
  Backspace: "Backspace",
  Delete: "Delete",
  PageUp: "Page Up",
  PageDown: "Page Down",
}

function displayKey(code: string) {
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)
  return displayKeys[code] ?? code
}

export function formatShortcut(binding: string, platform: string) {
  const { modifiers, code } = bindingParts(binding)
  if (applePlatform(platform)) {
    return `${modifiers.has("Control") ? "⌃" : ""}${modifiers.has("Alt") ? "⌥" : ""}${modifiers.has("Shift") ? "⇧" : ""}${modifiers.has("Mod") ? "⌘" : ""}${displayKey(code)}`
  }
  const labels = [
    modifiers.has("Mod") || modifiers.has("Control") ? "Ctrl" : null,
    modifiers.has("Alt") ? "Alt" : null,
    modifiers.has("Shift") ? "Shift" : null,
    displayKey(code),
  ].filter(Boolean)
  return labels.join("+")
}

export function shortcutAriaLabel(binding: string, platform: string) {
  const { modifiers, code } = bindingParts(binding)
  const apple = applePlatform(platform)
  return [
    modifiers.has("Mod") ? (apple ? "Meta" : "Control") : null,
    modifiers.has("Control") ? "Control" : null,
    modifiers.has("Alt") ? "Alt" : null,
    modifiers.has("Shift") ? "Shift" : null,
    displayKey(code),
  ]
    .filter(Boolean)
    .join("+")
}

export function findShortcutConflict(
  overrides: ShortcutOverrides,
  binding: string,
  exceptCommandId?: ShortcutCommandId,
  platform = "darwin"
) {
  return shortcutCommands.find(
    (command) =>
      command.id !== exceptCommandId &&
      effectiveShortcutBindings(overrides, command.id).some((candidate) =>
        shortcutBindingsConflict(candidate, binding, platform)
      )
  )
}

function shortcutBindingsConflict(
  left: string,
  right: string,
  platform: string
) {
  if (left === right) return true
  if (applePlatform(platform)) return false

  const leftParts = bindingParts(left)
  const rightParts = bindingParts(right)
  const hasPrimary = (modifiers: Set<string>) =>
    modifiers.has("Mod") || modifiers.has("Control")

  return (
    leftParts.code === rightParts.code &&
    hasPrimary(leftParts.modifiers) === hasPrimary(rightParts.modifiers) &&
    leftParts.modifiers.has("Alt") === rightParts.modifiers.has("Alt") &&
    leftParts.modifiers.has("Shift") === rightParts.modifiers.has("Shift")
  )
}

export function shortcutOverridesEqual(
  left: ShortcutOverrides,
  right: ShortcutOverrides
) {
  return shortcutCommandIds.every((commandId) => {
    const leftBindings = left[commandId]
    const rightBindings = right[commandId]
    return (
      leftBindings === rightBindings ||
      (leftBindings !== undefined &&
        rightBindings !== undefined &&
        leftBindings.length === rightBindings.length &&
        leftBindings.every(
          (binding, index) => binding === rightBindings[index]
        ))
    )
  })
}
