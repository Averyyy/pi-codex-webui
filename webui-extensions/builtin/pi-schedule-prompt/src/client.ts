import { defineClientExtension } from "@pi-web-codex/extension-sdk"
import { isScheduledPromptViewState, type ScheduledPromptViewState } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.45 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .container { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 12px; background: color-mix(in srgb, Canvas 98%, transparent); overflow: hidden; }
  .header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; user-select: none; }
  .header:hover { background: color-mix(in srgb, currentColor 4%, transparent); }
  .icon { font-size: 16px; }
  .icon.start { color: #3b82f6; }
  .icon.done { color: #10b981; }
  .icon.error { color: #dc2626; }
  .title { flex: 1; font-weight: 600; }
  .title.start { color: #3b82f6; }
  .title.done { color: #10b981; }
  .title.error { color: #dc2626; }
  .chevron { width: 16px; height: 16px; transition: transform 0.2s; color: color-mix(in srgb, currentColor 50%, transparent); }
  .chevron.expanded { transform: rotate(180deg); }
  .content { border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent); padding: 16px; }
  .field { margin-bottom: 12px; }
  .field:last-child { margin-bottom: 0; }
  .label { display: block; font-size: 12px; font-weight: 600; color: color-mix(in srgb, currentColor 60%, transparent); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .value { background: color-mix(in srgb, currentColor 5%, transparent); border-radius: 6px; padding: 10px 12px; font-size: 13px; line-height: 1.5; }
  .value.code { font-family: ui-monospace, monospace; white-space: pre-wrap; word-break: break-word; }
  .value.error { background: color-mix(in srgb, #dc2626 10%, transparent); border-left: 3px solid #dc2626; color: #dc2626; }
`

export default defineClientExtension((web) => {
  web.registerView({
    id: "scheduled-prompt.view",
    mount({ shadowRoot, state: initialState, signal }) {
      if (!isScheduledPromptViewState(initialState)) {
        throw new TypeError("Scheduled prompt adapter received invalid state.")
      }
      let state = initialState
      let expanded = false

      const style = document.createElement("style")
      style.textContent = styles
      const root = document.createElement("div")
      root.className = "container"
      shadowRoot.append(style, root)

      const render = () => {
        root.replaceChildren()

        const started =
          state.mode === "prompt" || state.mode === "subagent_start"

        const header = document.createElement("div")
        header.className = "header"

        const icon = document.createElement("span")
        icon.className = `icon ${started ? "start" : state.mode === "subagent_done" ? "done" : "error"}`
        icon.textContent = started ? "Scheduled" : state.mode === "subagent_done" ? "Done" : "Error"

        const title = document.createElement("span")
        title.className = `title ${started ? "start" : state.mode === "subagent_done" ? "done" : "error"}`
        const modeLabel = started ? "Scheduled" : state.mode === "subagent_done" ? "Scheduled finished" : "Scheduled failed"
        const tag = state.model ? ` (subagent: ${state.model})` : ""
        title.textContent = `${modeLabel}${tag}: ${state.jobName}`

        const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        chevron.setAttribute("class", expanded ? "chevron expanded" : "chevron")
        chevron.setAttribute("viewBox", "0 0 24 24")
        chevron.setAttribute("fill", "none")
        chevron.setAttribute("stroke", "currentColor")
        chevron.setAttribute("stroke-width", "2")
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
        path.setAttribute("d", "M6 9l6 6 6-6")
        chevron.appendChild(path)

        header.append(icon, title, chevron)
        header.addEventListener("click", () => {
          expanded = !expanded
          render()
        }, { signal })
        root.append(header)

        if (expanded) {
          const content = document.createElement("div")
          content.className = "content"

          if (state.prompt) {
            const field = document.createElement("div")
            field.className = "field"
            const label = document.createElement("span")
            label.className = "label"
            label.textContent = "Prompt"
            const value = document.createElement("div")
            value.className = "value code"
            value.textContent = state.prompt
            field.append(label, value)
            content.append(field)
          }

          if (state.output) {
            const field = document.createElement("div")
            field.className = "field"
            const label = document.createElement("span")
            label.className = "label"
            label.textContent = "Output"
            const value = document.createElement("div")
            value.className = "value"
            value.textContent = state.output
            field.append(label, value)
            content.append(field)
          }

          if (state.error) {
            const field = document.createElement("div")
            field.className = "field"
            const label = document.createElement("span")
            label.className = "label"
            label.textContent = "Error"
            const value = document.createElement("div")
            value.className = "value error"
            value.textContent = state.error
            field.append(label, value)
            content.append(field)
          }

          root.append(content)
        }
      }

      render()

      return {
        update(nextState) {
          if (!isScheduledPromptViewState(nextState)) {
            throw new TypeError("Scheduled prompt adapter received invalid state update.")
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
