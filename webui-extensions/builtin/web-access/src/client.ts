import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import { parseWebSearchState, parseWorkflowState } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .root { display: grid; gap: 16px; min-width: min(560px, 80vw); }
  .intro { margin: 0; color: color-mix(in srgb, currentColor 65%, transparent); }
  textarea { min-height: 150px; resize: vertical; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 10px; background: transparent; color: inherit; padding: 11px 12px; font: inherit; }
  textarea:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; padding: 9px 12px; }
  button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  .primary { background: currentColor; color: Canvas; }
  .primary:hover { opacity: .86; background: currentColor; }
  .options { display: grid; gap: 8px; }
  .option { display: grid; gap: 4px; width: 100%; padding: 12px; text-align: left; }
  .option strong { font-size: 14px; }
  .option span { color: color-mix(in srgb, currentColor 65%, transparent); }
`

function addStyle(shadowRoot: ShadowRoot) {
  const style = document.createElement("style")
  style.textContent = styles
  shadowRoot.append(style)
  return style
}

function cancelButton(close: (result?: unknown) => void) {
  const cancel = document.createElement("button")
  cancel.type = "button"
  cancel.textContent = "取消"
  cancel.addEventListener("click", () => close({ cancelled: true }))
  return cancel
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "web-access.search",
    mount({ shadowRoot, state, close, signal }) {
      const search = parseWebSearchState(state)
      const style = addStyle(shadowRoot)
      const root = document.createElement("form")
      root.className = "root"
      const intro = document.createElement("p")
      intro.className = "intro"
      intro.textContent =
        "每行一个查询。提交后继续使用 pi-web-access 自带的 Curator 搜索与筛选。"
      const queries = document.createElement("textarea")
      queries.name = "queries"
      queries.placeholder =
        "例如：\nNext.js 16 cache components\nReact 19 Activity component"
      queries.setAttribute("aria-label", "搜索查询")
      queries.required = true
      queries.value = search.queries.join("\n")
      const actions = document.createElement("div")
      actions.className = "actions"
      const cancel = cancelButton(close)
      const submit = document.createElement("button")
      submit.type = "submit"
      submit.className = "primary"
      submit.textContent = "打开 Curator"
      actions.append(cancel, submit)
      root.append(intro, queries, actions)
      shadowRoot.append(root)
      queries.addEventListener("input", () => queries.setCustomValidity(""), {
        signal,
      })
      root.addEventListener(
        "submit",
        (event) => {
          event.preventDefault()
          const nextQueries = queries.value
            .split("\n")
            .map((query) => query.trim())
            .filter(Boolean)
          if (!nextQueries.length) {
            queries.setCustomValidity("请输入至少一个查询。")
            queries.reportValidity()
            return
          }
          queries.setCustomValidity("")
          close({
            queries: nextQueries,
          })
        },
        { signal }
      )
      queries.focus()
      return {
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })

  web.registerView({
    id: "web-access.workflow",
    mount({ shadowRoot, state, close, signal }) {
      const workflowState = parseWorkflowState(state)
      const style = addStyle(shadowRoot)
      const root = document.createElement("section")
      root.className = "root"
      const intro = document.createElement("p")
      intro.className = "intro"
      intro.textContent = "选择 web_search 的默认结果处理方式。"
      const options = document.createElement("div")
      options.className = "options"
      for (const workflow of workflowState.workflows) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "option"
        const label = document.createElement("strong")
        label.textContent = workflow.label
        const description = document.createElement("span")
        description.textContent = workflow.description
        button.append(label, description)
        button.addEventListener(
          "click",
          () => close({ workflow: workflow.value }),
          { signal }
        )
        options.append(button)
      }
      const actions = document.createElement("div")
      actions.className = "actions"
      actions.append(cancelButton(close))
      root.append(intro, options, actions)
      shadowRoot.append(root)
      return {
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })
})
