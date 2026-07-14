import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import { parseCodexQuickSettingsState } from "./contract.js"

export default defineClientExtension((web) => {
  web.registerView({
    id: "codex.quick-settings",
    mount({ container, state, close }) {
      const settings = parseCodexQuickSettingsState(state)
      const root = document.createElement("section")
      root.style.cssText = "display:grid;gap:16px;font:14px system-ui"
      const intro = document.createElement("p")
      intro.textContent =
        "Choose a shortcut. The installed Pi Extension still applies and saves the setting."
      intro.style.cssText =
        "margin:0;color:color-mix(in srgb,currentColor 70%,transparent)"
      const actions = document.createElement("div")
      actions.style.cssText =
        "display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"
      for (const action of settings.actions) {
        const button = document.createElement("button")
        button.type = "button"
        button.style.cssText =
          "display:grid;gap:4px;text-align:left;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:10px;background:transparent;color:inherit;padding:12px;cursor:pointer"
        const label = document.createElement("strong")
        label.textContent = action.label
        const description = document.createElement("span")
        description.textContent = action.description
        description.style.opacity = "0.7"
        button.append(label, description)
        button.addEventListener("click", () =>
          close({ command: action.command })
        )
        actions.append(button)
      }
      const cancel = document.createElement("button")
      cancel.type = "button"
      cancel.textContent = "Cancel"
      cancel.style.cssText =
        "justify-self:end;border:0;background:transparent;color:inherit;padding:8px;cursor:pointer"
      cancel.addEventListener("click", () => close({ cancelled: true }))
      root.append(intro, actions, cancel)
      container.append(root)
      return { dispose: () => root.remove() }
    },
  })
})
