import { defineClientExtension } from "@pi-web-codex/extension-sdk"
import { isResourceCenterViewState, type ResourceCenterViewState } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.45 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .container { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 12px; background: color-mix(in srgb, Canvas 98%, transparent); overflow: hidden; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: color-mix(in srgb, currentColor 3%, transparent); }
  .title { font-weight: 600; color: color-mix(in srgb, currentColor 90%, transparent); }
  .count { font-size: 12px; color: color-mix(in srgb, currentColor 60%, transparent); }
  .list { max-height: 400px; overflow-y: auto; }
  .item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent); transition: background 0.15s; }
  .item:hover { background: color-mix(in srgb, currentColor 4%, transparent); }
  .icon { width: 16px; height: 16px; flex-shrink: 0; }
  .content { flex: 1; min-width: 0; }
  .item-title { font-weight: 500; color: color-mix(in srgb, currentColor 85%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-url { font-size: 12px; color: color-mix(in srgb, currentColor 55%, transparent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .item-meta { font-size: 11px; color: color-mix(in srgb, currentColor 50%, transparent); margin-top: 2px; }
  .status { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; }
  .status.pending { background: color-mix(in srgb, #eab308 15%, transparent); color: #eab308; }
  .status.complete { background: color-mix(in srgb, #22c55e 15%, transparent); color: #22c55e; }
  .status.error { background: color-mix(in srgb, #dc2626 15%, transparent); color: #dc2626; }
  .empty { padding: 32px; text-align: center; color: color-mix(in srgb, currentColor 50%, transparent); }
`

export default defineClientExtension((web) => {
  web.registerView({
    id: "resource-center.view",
    mount({ shadowRoot, state: initialState, signal }) {
      if (!isResourceCenterViewState(initialState)) {
        throw new TypeError("Resource center adapter received invalid state.")
      }
      let state = initialState

      const style = document.createElement("style")
      style.textContent = styles
      const root = document.createElement("div")
      root.className = "container"
      shadowRoot.append(style, root)

      const getTypeIcon = (type: string) => {
        const icons: Record<string, string> = {
          search: "🔍",
          fetch: "📄",
          source_check: "✓",
          other: "📎",
        }
        return icons[type] || "📎"
      }

      const formatTime = (timestamp: number) => {
        const date = new Date(timestamp)
        const now = Date.now()
        const diff = now - timestamp
        if (diff < 60000) return "just now"
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return date.toLocaleDateString()
      }

      const render = () => {
        root.replaceChildren()

        const header = document.createElement("div")
        header.className = "header"
        
        const title = document.createElement("div")
        title.className = "title"
        title.textContent = "Resource Center"
        
        const count = document.createElement("div")
        count.className = "count"
        count.textContent = `${state.totalCount} resource${state.totalCount !== 1 ? "s" : ""}`
        
        header.append(title, count)
        root.append(header)

        if (state.resources.length === 0) {
          const empty = document.createElement("div")
          empty.className = "empty"
          empty.textContent = "No resources available"
          root.append(empty)
          return
        }

        const list = document.createElement("div")
        list.className = "list"

        for (const resource of state.resources) {
          const item = document.createElement("div")
          item.className = "item"

          const icon = document.createElement("span")
          icon.className = "icon"
          icon.textContent = getTypeIcon(resource.type)
          item.append(icon)

          const content = document.createElement("div")
          content.className = "content"

          const itemTitle = document.createElement("div")
          itemTitle.className = "item-title"
          itemTitle.textContent = resource.title
          content.append(itemTitle)

          if (resource.url) {
            const itemUrl = document.createElement("div")
            itemUrl.className = "item-url"
            itemUrl.textContent = resource.url
            content.append(itemUrl)
          }

          const meta = document.createElement("div")
          meta.className = "item-meta"
          meta.textContent = formatTime(resource.timestamp)
          content.append(meta)

          item.append(content)

          if (resource.status) {
            const status = document.createElement("span")
            status.className = `status ${resource.status}`
            status.textContent = resource.status
            item.append(status)
          }

          list.append(item)
        }

        root.append(list)
      }

      render()

      return {
        update(nextState) {
          if (!isResourceCenterViewState(nextState)) {
            throw new TypeError("Resource center adapter received invalid state update.")
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
