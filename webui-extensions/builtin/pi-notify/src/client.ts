import { defineClientExtension } from "@pi-web-codex/extension-sdk"
import { isNotifyViewState, type NotifyViewState } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.45 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .container { padding: 12px 16px; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 8px; background: color-mix(in srgb, Canvas 98%, transparent); }
  .header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .icon { width: 20px; height: 20px; }
  .title { font-weight: 600; color: color-mix(in srgb, currentColor 90%, transparent); }
  .body { color: color-mix(in srgb, currentColor 70%, transparent); line-height: 1.5; }
  .status { margin-top: 8px; padding: 8px; background: color-mix(in srgb, currentColor 5%, transparent); border-radius: 4px; font-size: 12px; color: color-mix(in srgb, currentColor 60%, transparent); }
`

export default defineClientExtension((web) => {
  web.registerView({
    id: "notify.view",
    mount({ shadowRoot, state: initialState, signal }) {
      if (!isNotifyViewState(initialState)) {
        throw new TypeError("Notify adapter received invalid state.")
      }
      let state = initialState

      const style = document.createElement("style")
      style.textContent = styles
      const root = document.createElement("div")
      root.className = "container"
      shadowRoot.append(style, root)

      const render = () => {
        root.replaceChildren()

        const header = document.createElement("div")
        header.className = "header"
        
        if (state.icon) {
          const icon = document.createElement("img")
          icon.className = "icon"
          icon.src = state.icon
          header.append(icon)
        }

        const title = document.createElement("div")
        title.className = "title"
        title.textContent = state.title
        header.append(title)
        root.append(header)

        if (state.body) {
          const body = document.createElement("div")
          body.className = "body"
          body.textContent = state.body
          root.append(body)
        }

        const status = document.createElement("div")
        status.className = "status"

        if ("Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification(state.title, {
              body: state.body,
              icon: state.icon,
              tag: state.tag,
            })
            status.textContent = "✓ Browser notification sent"
          } else if (Notification.permission === "denied") {
            status.textContent = "⚠ Browser notifications blocked"
          } else {
            Notification.requestPermission().then((permission) => {
              if (permission === "granted") {
                new Notification(state.title, {
                  body: state.body,
                  icon: state.icon,
                  tag: state.tag,
                })
                status.textContent = "✓ Browser notification sent"
              }
            })
            status.textContent = "Requesting notification permission..."
          }
        } else {
          status.textContent = "Browser notifications not supported"
        }

        root.append(status)
      }

      render()

      return {
        update(nextState) {
          if (!isNotifyViewState(nextState)) {
            throw new TypeError("Notify adapter received invalid state update.")
          }
          state = nextState
          render()
        },
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })
})
