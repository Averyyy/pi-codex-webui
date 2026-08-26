import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import { parseResourceCenterState } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.45 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .root { display: grid; gap: 12px; width: min(620px, 82vw); max-width: 100%; }
  .options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .option { display: grid; gap: 3px; min-width: 0; padding: 11px 12px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
  .option:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
  .option strong, .option span { overflow-wrap: anywhere; }
  .option span { color: color-mix(in srgb, currentColor 65%, transparent); font-size: 12px; }
  .actions { display: flex; justify-content: flex-end; }
  .cancel { border: 0; background: transparent; color: inherit; padding: 8px 10px; cursor: pointer; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  @media (max-width: 560px) { .options { grid-template-columns: 1fr; } }
`

export default defineClientExtension((web) => {
  web.registerView({
    id: "resource-center.browser",
    mount({ shadowRoot, state, close, signal }) {
      const parsed = parseResourceCenterState(state)
      const style = document.createElement("style")
      style.textContent = styles
      const root = document.createElement("section")
      root.className = "root"
      const options = document.createElement("div")
      options.className = "options"

      for (const category of parsed.categories) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "option"
        const label = document.createElement("strong")
        label.textContent = category.label
        const description = document.createElement("span")
        description.textContent = category.description
        button.append(label, description)
        button.addEventListener(
          "click",
          () => close({ commandArgs: category.value }),
          { signal }
        )
        options.append(button)
      }

      const actions = document.createElement("div")
      actions.className = "actions"
      const cancel = document.createElement("button")
      cancel.type = "button"
      cancel.className = "cancel"
      cancel.textContent = "Cancel"
      cancel.addEventListener("click", () => close({ cancelled: true }), {
        signal,
      })
      actions.append(cancel)
      root.append(options, actions)
      shadowRoot.append(style, root)

      return {
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })
})
