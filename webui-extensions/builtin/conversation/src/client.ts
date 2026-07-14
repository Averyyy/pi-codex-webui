import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import { isConversationState } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.4 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .root { display: grid; gap: 12px; min-width: min(560px, 80vw); }
  .top { display: flex; gap: 8px; }
  input { flex: 1; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 8px; background: transparent; color: inherit; padding: 9px 11px; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; padding: 9px 11px; text-align: left; }
  button:hover, button:focus-visible { background: color-mix(in srgb, currentColor 8%, transparent); outline: none; }
  .list { display: grid; gap: 6px; max-height: min(56vh, 520px); overflow: auto; }
  .item { display: grid; gap: 2px; width: 100%; }
  .active { border-color: currentColor; }
  small { opacity: .65; }
  .empty { opacity: .65; padding: 20px 4px; text-align: center; }
`

export default defineClientExtension((web) => {
  web.registerView({
    id: "conversation.browser",
    mount({ shadowRoot, state, close, signal }) {
      if (!isConversationState(state)) {
        throw new TypeError("Conversation adapter received invalid state.")
      }
      const style = document.createElement("style")
      style.textContent = styles
      const root = document.createElement("div")
      root.className = "root"
      const top = document.createElement("div")
      top.className = "top"
      const search = document.createElement("input")
      search.type = "search"
      search.placeholder = "Filter conversations"
      search.setAttribute("aria-label", "Filter conversations")
      const cancel = document.createElement("button")
      cancel.type = "button"
      cancel.textContent = "Close"
      cancel.addEventListener("click", () => close({}))
      top.append(search, cancel)
      const list = document.createElement("div")
      list.className = "list"
      root.append(top, list)
      shadowRoot.append(style, root)

      const render = () => {
        const query = search.value.trim().toLocaleLowerCase()
        const visible = state.conversations.filter((conversation) =>
          conversation.name.toLocaleLowerCase().includes(query)
        )
        list.replaceChildren()
        if (!visible.length) {
          const empty = document.createElement("p")
          empty.className = "empty"
          empty.textContent = "No matching conversations"
          list.append(empty)
          return
        }
        for (const conversation of visible) {
          const button = document.createElement("button")
          button.type = "button"
          button.className = `item${
            conversation.sessionPath === state.currentSessionPath
              ? " active"
              : ""
          }`
          const name = document.createElement("span")
          name.textContent = conversation.name
          const updated = document.createElement("small")
          updated.textContent = new Date(
            conversation.updatedAt
          ).toLocaleString()
          button.append(name, updated)
          button.addEventListener("click", () =>
            close({ sessionPath: conversation.sessionPath })
          )
          list.append(button)
        }
      }
      search.addEventListener("input", render, { signal })
      render()
      search.focus()
      return {
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })
})
