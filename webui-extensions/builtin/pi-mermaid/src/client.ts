import { defineClientExtension } from "@pi-web-codex/extension-sdk"
import mermaid from "mermaid"
import { isMermaidViewState, type MermaidViewState } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.45 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .container { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 12px; background: color-mix(in srgb, Canvas 98%, transparent); overflow: hidden; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; user-select: none; }
  .header:hover { background: color-mix(in srgb, currentColor 4%, transparent); }
  .title { font-weight: 600; color: color-mix(in srgb, currentColor 70%, transparent); }
  .chevron { width: 16px; height: 16px; transition: transform 0.2s; }
  .chevron.expanded { transform: rotate(180deg); }
  .content { border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent); padding: 16px; }
  .diagram { display: flex; justify-content: center; margin-bottom: 16px; }
  .source { background: color-mix(in srgb, currentColor 5%, transparent); border-radius: 8px; padding: 12px; overflow-x: auto; }
  .source pre { margin: 0; font-family: ui-monospace, monospace; font-size: 13px; line-height: 1.5; }
  .issues { margin-top: 12px; padding: 10px 12px; background: color-mix(in srgb, #dc2626 10%, transparent); border-left: 3px solid #dc2626; border-radius: 4px; }
  .issue { margin: 4px 0; font-size: 13px; color: #dc2626; }
  .error { display: block; padding: 12px; background: color-mix(in srgb, #dc2626 10%, transparent); border-left: 3px solid #dc2626; color: #dc2626; font-size: 13px; }
`

mermaid.initialize({ startOnLoad: false, theme: "default" })

export default defineClientExtension((web) => {
  web.registerView({
    id: "mermaid.diagram",
    mount({ shadowRoot, state: initialState, signal }) {
      if (!isMermaidViewState(initialState)) {
        throw new TypeError("Mermaid adapter received invalid state.")
      }
      let state = initialState
      let expanded = false
      let renderError = ""

      const style = document.createElement("style")
      style.textContent = styles
      const root = document.createElement("div")
      root.className = "container"
      shadowRoot.append(style, root)

      const renderDiagram = async (container: HTMLElement, source: string) => {
        try {
          const { svg } = await mermaid.render(`mermaid-${Date.now()}`, source)
          container.innerHTML = svg
        } catch (error) {
          renderError = error instanceof Error ? error.message : String(error)
          const errorEl = document.createElement("span")
          errorEl.className = "error"
          errorEl.textContent = `Render failed: ${renderError}`
          container.replaceChildren(errorEl)
        }
      }

      const render = () => {
        root.replaceChildren()

        const header = document.createElement("div")
        header.className = "header"
        const title = document.createElement("span")
        title.className = "title"
        title.textContent = "Mermaid"
        const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        chevron.setAttribute("class", expanded ? "chevron expanded" : "chevron")
        chevron.setAttribute("viewBox", "0 0 24 24")
        chevron.setAttribute("fill", "none")
        chevron.setAttribute("stroke", "currentColor")
        chevron.setAttribute("stroke-width", "2")
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
        path.setAttribute("d", "M6 9l6 6 6-6")
        chevron.appendChild(path)
        header.append(title, chevron)
        header.addEventListener("click", () => {
          expanded = !expanded
          render()
        }, { signal })
        root.append(header)

        if (expanded) {
          const content = document.createElement("div")
          content.className = "content"
          
          const diagram = document.createElement("div")
          diagram.className = "diagram"
          content.append(diagram)
          renderDiagram(diagram, state.source)

          const source = document.createElement("div")
          source.className = "source"
          const pre = document.createElement("pre")
          pre.textContent = state.source
          source.append(pre)
          content.append(source)

          if (state.issues && state.issues.length > 0) {
            const issues = document.createElement("div")
            issues.className = "issues"
            state.issues.forEach((issue) => {
              const div = document.createElement("div")
              div.className = "issue"
              div.textContent = `[${issue.severity}] ${issue.message}`
              issues.append(div)
            })
            content.append(issues)
          }

          root.append(content)
        }
      }

      render()

      return {
        update(nextState) {
          if (!isMermaidViewState(nextState)) {
            throw new TypeError("Mermaid adapter received invalid state update.")
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
