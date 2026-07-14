import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import { parseGreetingState } from "./contract.js"

export default defineClientExtension((web) => {
  web.registerView({
    id: "greeter.dialog",
    mount({ container, state, close }) {
      const greeting = parseGreetingState(state)
      const root = document.createElement("section")
      root.style.cssText = "display:grid;gap:16px;font:14px system-ui"
      const message = document.createElement("p")
      message.textContent = greeting.message
      const button = document.createElement("button")
      button.type = "button"
      button.textContent = "Close"
      button.style.cssText =
        "justify-self:start;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;padding:8px 12px;cursor:pointer"
      button.addEventListener("click", () => close())
      root.append(message, button)
      container.append(root)
      return { dispose: () => root.remove() }
    },
  })
})
