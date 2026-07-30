import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import {
  parseTodoState,
  type TodoState,
  type TodoStatus,
  type TodoTask,
} from "./contract.js"

const styles = `
  :host { display: block; height: 100%; color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .root { display: flex; height: 100%; min-height: 320px; flex-direction: column; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); }
  .header strong { font-size: 13px; }
  .header-actions { display: flex; gap: 7px; }
  .summary, .empty, .meta, .feedback, .hint { margin: 0; color: color-mix(in srgb, currentColor 64%, transparent); font-size: 12px; }
  .tasks { display: grid; flex: 1; align-content: start; gap: 9px; overflow: auto; padding: 12px; }
  .group { display: grid; gap: 7px; }
  .group-title { margin: 4px 0 0; color: color-mix(in srgb, currentColor 60%, transparent); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  .task { display: grid; gap: 7px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 10px; padding: 10px; }
  .task-head { display: flex; align-items: flex-start; gap: 7px; }
  .task-title { min-width: 0; flex: 1; overflow-wrap: anywhere; }
  .task-title strong { display: block; }
  .id { flex: none; border-radius: 999px; background: color-mix(in srgb, currentColor 8%, transparent); padding: 1px 7px; font: 11px/1.6 ui-monospace, monospace; }
  .description { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .footer { display: grid; gap: 6px; border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding: 10px 12px 12px; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; padding: 6px 9px; font: inherit; font-size: 12px; }
  button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  button:disabled { opacity: .5; cursor: wait; }
  .error { color: #dc2626; }
`

const GROUPS: Array<{ status: Exclude<TodoStatus, "deleted">; label: string }> =
  [
    { status: "in_progress", label: "进行中" },
    { status: "pending", label: "待处理" },
    { status: "completed", label: "已完成" },
  ]

function addStyle(root: ShadowRoot) {
  const style = document.createElement("style")
  style.textContent = styles
  root.append(style)
  return style
}

function taskCard(task: TodoTask) {
  const card = document.createElement("article")
  card.className = "task"
  const head = document.createElement("div")
  head.className = "task-head"
  const title = document.createElement("div")
  title.className = "task-title"
  const subject = document.createElement("strong")
  subject.textContent =
    task.status === "in_progress" && task.activeForm
      ? task.activeForm
      : task.subject
  const id = document.createElement("span")
  id.className = "id"
  id.textContent = `#${task.id}`
  title.append(subject)
  head.append(title, id)
  card.append(head)
  if (task.description) {
    const description = document.createElement("p")
    description.className = "description"
    description.textContent = task.description
    card.append(description)
  }
  const metadata = [
    task.owner ? `负责人：${task.owner}` : "",
    task.blockedBy?.length
      ? `依赖：${task.blockedBy.map((id) => `#${id}`).join("、")}`
      : "",
  ].filter(Boolean)
  if (metadata.length) {
    const meta = document.createElement("p")
    meta.className = "meta"
    meta.textContent = metadata.join(" · ")
    card.append(meta)
  }
  return card
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "rpiv-todo.panel",
    mount({ shadowRoot, state, invoke, close, signal }) {
      let current: TodoState = parseTodoState(state)
      let busy = false
      const style = addStyle(shadowRoot)
      const root = document.createElement("section")
      root.className = "root"
      const header = document.createElement("header")
      header.className = "header"
      const heading = document.createElement("div")
      const title = document.createElement("strong")
      title.textContent = "任务"
      const summary = document.createElement("p")
      summary.className = "summary"
      heading.append(title, summary)
      const headerActions = document.createElement("div")
      headerActions.className = "header-actions"
      const refresh = document.createElement("button")
      refresh.type = "button"
      refresh.textContent = "刷新"
      const closeButton = document.createElement("button")
      closeButton.type = "button"
      closeButton.textContent = "关闭"
      closeButton.addEventListener("click", () => close(), { signal })
      headerActions.append(refresh, closeButton)
      header.append(heading, headerActions)
      const tasks = document.createElement("div")
      tasks.className = "tasks"
      const footer = document.createElement("footer")
      footer.className = "footer"
      const feedback = document.createElement("p")
      feedback.className = "feedback"
      const hint = document.createElement("p")
      hint.className = "hint"
      hint.textContent =
        "任务修改仍由 todo 工具完成，确保变更写入会话并可在 reload/compaction 后重放。"
      footer.append(feedback, hint)
      root.append(header, tasks, footer)
      shadowRoot.append(root)

      const render = (next: unknown) => {
        current = parseTodoState(next)
        const visible = current.tasks.filter(
          (task) => task.status !== "deleted"
        )
        const completed = visible.filter(
          (task) => task.status === "completed"
        ).length
        summary.textContent = `${completed}/${visible.length} 已完成`
        tasks.replaceChildren()
        if (!visible.length) {
          const empty = document.createElement("p")
          empty.className = "empty"
          empty.textContent = "还没有任务。"
          tasks.append(empty)
        }
        for (const group of GROUPS) {
          const grouped = visible.filter((task) => task.status === group.status)
          if (!grouped.length) continue
          const section = document.createElement("section")
          section.className = "group"
          const groupTitle = document.createElement("h3")
          groupTitle.className = "group-title"
          groupTitle.textContent = `${group.label} · ${grouped.length}`
          section.append(groupTitle)
          for (const task of grouped) section.append(taskCard(task))
          tasks.append(section)
        }
        feedback.textContent = current.error ?? current.output ?? ""
        feedback.classList.toggle("error", Boolean(current.error))
      }
      refresh.addEventListener(
        "click",
        () => {
          if (busy) return
          busy = true
          refresh.disabled = true
          refresh.textContent = "刷新中…"
          void invoke("rpiv-todo.refresh")
            .then(render)
            .catch((error: unknown) => {
              feedback.textContent =
                error instanceof Error ? error.message : String(error)
              feedback.classList.add("error")
            })
            .finally(() => {
              busy = false
              refresh.disabled = false
              refresh.textContent = "刷新"
            })
        },
        { signal }
      )
      render(current)
      return {
        update: render,
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })
})
