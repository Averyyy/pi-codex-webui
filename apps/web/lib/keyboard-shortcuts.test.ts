import assert from "node:assert/strict"
import test from "node:test"

import {
  effectiveShortcutBindings,
  findShortcutConflict,
  formatShortcut,
  isShortcutBinding,
  normalizeShortcutOverrides,
  shortcutCommandIds,
  shortcutCommands,
  shortcutFromKeyboardEvent,
  shortcutMatchesEvent,
} from "./keyboard-shortcuts"

test("shortcut registry covers every command once with valid unique defaults", () => {
  assert.deepEqual(
    shortcutCommands.map((command) => command.id).sort(),
    [...shortcutCommandIds].sort()
  )

  const owners = new Map<string, string>()
  for (const command of shortcutCommands) {
    for (const binding of command.defaultBindings) {
      assert.equal(isShortcutBinding(binding), true, binding)
      assert.equal(owners.has(binding), false, `${binding} is duplicated`)
      owners.set(binding, command.id)
    }
  }
})

test("shortcut matching distinguishes Command and Control on macOS", () => {
  const commandN = {
    code: "KeyN",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  }
  assert.equal(shortcutMatchesEvent("Mod+KeyN", commandN, "MacIntel"), true)
  assert.equal(
    shortcutMatchesEvent("Control+KeyN", commandN, "MacIntel"),
    false
  )

  const controlTab = {
    code: "Tab",
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
  }
  assert.equal(
    shortcutMatchesEvent("Control+Tab", controlTab, "MacIntel"),
    true
  )
  assert.equal(shortcutMatchesEvent("Mod+Tab", controlTab, "MacIntel"), false)
})

test("primary and explicit Control bindings both use Ctrl off macOS", () => {
  const event = {
    code: "KeyB",
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
  }
  assert.equal(shortcutMatchesEvent("Mod+KeyB", event, "Win32"), true)
  assert.equal(shortcutMatchesEvent("Control+KeyB", event, "Win32"), true)
})

test("keyboard capture and display use portable primary modifiers", () => {
  const event = {
    code: "KeyO",
    metaKey: true,
    ctrlKey: false,
    altKey: true,
    shiftKey: true,
  }
  assert.equal(
    shortcutFromKeyboardEvent(event, "MacIntel"),
    "Mod+Alt+Shift+KeyO"
  )
  assert.equal(formatShortcut("Mod+KeyN", "darwin"), "⌘N")
  assert.equal(formatShortcut("Mod+Alt+Shift+KeyO", "MacIntel"), "⌥⇧⌘O")
  assert.equal(
    formatShortcut("Mod+Alt+Shift+KeyO", "Win32"),
    "Ctrl+Alt+Shift+O"
  )
})

test("shortcut overrides preserve explicit unassignment and reject bad records", () => {
  const overrides = normalizeShortcutOverrides({
    "conversation.new": [],
    "settings.open": ["Mod+KeyS"],
    unknown: ["Mod+KeyU"],
    "settings.mcp": ["plain-key"],
  })

  assert.deepEqual(effectiveShortcutBindings(overrides, "conversation.new"), [])
  assert.deepEqual(effectiveShortcutBindings(overrides, "settings.open"), [
    "Mod+KeyS",
  ])
  assert.equal("unknown" in overrides, false)
  assert.equal("settings.mcp" in overrides, false)
})

test("conflict lookup uses effective defaults and overrides", () => {
  assert.equal(findShortcutConflict({}, "Mod+KeyN")?.id, "conversation.new")
  assert.equal(
    findShortcutConflict(
      { "conversation.new": [] },
      "Mod+KeyN",
      "settings.mcp"
    ),
    undefined
  )
  assert.equal(
    findShortcutConflict({}, "Control+KeyB", undefined, "Win32")?.id,
    "workspace.toggleSidebar"
  )
  assert.equal(
    findShortcutConflict({}, "Control+KeyB", undefined, "darwin"),
    undefined
  )
})
