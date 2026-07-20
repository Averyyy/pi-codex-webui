import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import {
  isGoalViewState,
  type GoalActionInput,
  type GoalStatus,
  type GoalViewState,
} from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.45 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  button, input, textarea { font: inherit; }
  .card { border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 18px; background: color-mix(in srgb, Canvas 96%, transparent); color: CanvasText; overflow: hidden; }
  .summary { display: flex; min-width: 0; align-items: center; gap: 10px; padding: 11px 14px; }
  .target { width: 20px; height: 20px; flex: none; color: color-mix(in srgb, currentColor 52%, transparent); }
  .title { flex: none; font-size: 15px; font-weight: 600; }
  .preview { min-width: 0; flex: 1; overflow: hidden; color: color-mix(in srgb, currentColor 55%, transparent); text-overflow: ellipsis; white-space: nowrap; }
  .elapsed { flex: none; color: color-mix(in srgb, currentColor 48%, transparent); font-variant-numeric: tabular-nums; }
  .actions { display: flex; flex: none; align-items: center; gap: 2px; }
  .icon-button { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 999px; background: transparent; color: color-mix(in srgb, currentColor 56%, transparent); cursor: pointer; }
  .icon-button:hover, .icon-button:focus-visible { background: color-mix(in srgb, currentColor 7%, transparent); color: currentColor; outline: none; }
  .icon-button:disabled { cursor: wait; opacity: .45; }
  .icon-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
  .details { border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent); padding: 0 14px 14px 44px; }
  .objective { margin: 12px 0 0; color: color-mix(in srgb, currentColor 62%, transparent); white-space: pre-wrap; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px; color: color-mix(in srgb, currentColor 48%, transparent); font-size: 12px; }
  .editor { display: grid; gap: 9px; padding-top: 12px; }
  textarea, input { width: 100%; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 10px; background: transparent; color: inherit; padding: 9px 10px; outline: none; }
  textarea { min-height: 88px; resize: vertical; }
  textarea:focus, input:focus { border-color: color-mix(in srgb, currentColor 42%, transparent); }
  .editor-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; }
  .text-button { border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; padding: 8px 11px; }
  .text-button.primary { background: currentColor; color: Canvas; }
  .error { margin: 8px 0 0; color: #dc2626; font-size: 12px; }
  @media (max-width: 560px) {
    .summary { align-items: flex-start; gap: 8px; padding-inline: 11px; }
    .preview { display: none; }
    .elapsed { margin-left: auto; }
    .details { padding-left: 39px; padding-right: 11px; }
    .editor-row { grid-template-columns: 1fr 1fr; }
    .budget { grid-column: 1 / -1; }
  }
`

const statusLabels: Record<GoalStatus, string> = {
  active: "进行中的目标",
  queued: "排队中的目标",
  paused: "已暂停的目标",
  blocked: "受阻的目标",
  usage_limited: "用量受限的目标",
  budget_limited: "预算已用尽的目标",
  complete: "已完成的目标",
}

const icons = {
  target: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M22 12h-3"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>`,
}

function duration(state: GoalViewState) {
  const goal = state.goal
  const live =
    goal.status === "active" && goal.activeStartedAt
      ? Math.max(0, Date.now() - goal.activeStartedAt) / 1_000
      : 0
  let seconds = Math.max(0, Math.floor(goal.timeUsedSeconds + live))
  const days = Math.floor(seconds / 86_400)
  seconds %= 86_400
  const hours = Math.floor(seconds / 3_600)
  seconds %= 3_600
  const minutes = Math.floor(seconds / 60)
  seconds %= 60
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(" ")
}

function formatTokens(value: number) {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${Number((value / 1_000).toFixed(1))}k`
  return `${Number((value / 1_000_000).toFixed(1))}m`
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "goal.card",
    mount({ shadowRoot, state: initialState, invoke, signal }) {
      if (!isGoalViewState(initialState)) {
        throw new TypeError("Goal adapter received invalid state.")
      }
      let state = initialState
      let expanded = false
      let editing = false
      let pending = false
      let error = ""
      const style = document.createElement("style")
      style.textContent = styles
      const root = document.createElement("section")
      root.className = "card"
      shadowRoot.append(style, root)

      const run = async (input: GoalActionInput) => {
        pending = true
        error = ""
        render()
        try {
          await invoke("goal.command", input)
        } catch (failure) {
          error = failure instanceof Error ? failure.message : String(failure)
        } finally {
          pending = false
          render()
        }
      }

      const actionButton = (
        label: string,
        icon: string,
        action: () => void
      ) => {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "icon-button"
        button.setAttribute("aria-label", label)
        button.title = label
        button.disabled = pending
        button.innerHTML = icon
        button.addEventListener("click", action, { signal })
        return button
      }

      const render = () => {
        root.replaceChildren()
        const summary = document.createElement("div")
        summary.className = "summary"
        const target = document.createElement("span")
        target.className = "target"
        target.innerHTML = icons.target
        const title = document.createElement("span")
        title.className = "title"
        title.textContent = statusLabels[state.goal.status]
        const preview = document.createElement("span")
        preview.className = "preview"
        preview.textContent = state.goal.text
        const elapsed = document.createElement("span")
        elapsed.className = "elapsed"
        elapsed.textContent = duration(state)
        const actions = document.createElement("span")
        actions.className = "actions"
        actions.append(
          actionButton("编辑目标", icons.edit, () => {
            expanded = true
            editing = !editing
            render()
          })
        )
        if (state.goal.status === "active") {
          actions.append(
            actionButton(
              "暂停目标",
              icons.pause,
              () => void run({ command: "pause" })
            )
          )
        } else if (
          ["paused", "blocked", "usage_limited", "budget_limited"].includes(
            state.goal.status
          )
        ) {
          actions.append(
            actionButton(
              "恢复目标",
              icons.play,
              () => void run({ command: "resume" })
            )
          )
        }
        actions.append(
          actionButton(
            "清除目标",
            icons.trash,
            () => void run({ command: "clear" })
          ),
          actionButton(
            expanded ? "收起目标" : "展开目标",
            icons.chevron,
            () => {
              expanded = !expanded
              if (!expanded) editing = false
              render()
            }
          )
        )
        summary.append(target, title, preview, elapsed, actions)
        root.append(summary)

        if (!expanded) return
        const details = document.createElement("div")
        details.className = "details"
        const objective = document.createElement("p")
        objective.className = "objective"
        objective.textContent = state.goal.text
        const meta = document.createElement("div")
        meta.className = "meta"
        meta.append(
          `第 ${state.goal.iteration + 1} 轮`,
          `已用 ${formatTokens(state.goal.tokensUsed)} tokens`
        )
        if (state.goal.tokenBudget) {
          meta.append(`预算 ${formatTokens(state.goal.tokenBudget)}`)
        }
        if (state.queue.length) meta.append(`队列 ${state.queue.length}`)
        details.append(objective, meta)

        if (editing) {
          const editor = document.createElement("form")
          editor.className = "editor"
          const textarea = document.createElement("textarea")
          textarea.value = state.goal.text
          textarea.maxLength = 4_000
          textarea.required = true
          textarea.setAttribute("aria-label", "目标内容")
          const row = document.createElement("div")
          row.className = "editor-row"
          const budget = document.createElement("input")
          budget.className = "budget"
          budget.type = "number"
          budget.min = "1"
          budget.step = "1"
          budget.placeholder = "Token 预算（可选）"
          budget.setAttribute("aria-label", "Token 预算")
          if (state.goal.tokenBudget)
            budget.value = String(state.goal.tokenBudget)
          const cancel = document.createElement("button")
          cancel.type = "button"
          cancel.className = "text-button"
          cancel.textContent = "取消"
          cancel.addEventListener(
            "click",
            () => {
              editing = false
              render()
            },
            { signal }
          )
          const save = document.createElement("button")
          save.type = "submit"
          save.className = "text-button primary"
          save.textContent = "保存"
          save.disabled = pending
          row.append(budget, cancel, save)
          editor.append(textarea, row)
          editor.addEventListener(
            "submit",
            (event) => {
              event.preventDefault()
              const objectiveValue = textarea.value.trim()
              if (!objectiveValue) return
              const tokenBudget = budget.value
                ? Number(budget.value)
                : undefined
              void run({
                command: "edit",
                objective: objectiveValue,
                tokenBudget,
              })
            },
            { signal }
          )
          details.append(editor)
          queueMicrotask(() => textarea.focus())
        }
        if (error) {
          const notice = document.createElement("p")
          notice.className = "error"
          notice.setAttribute("role", "alert")
          notice.textContent = error
          details.append(notice)
        }
        root.append(details)
      }

      const timer = window.setInterval(() => {
        const elapsed = root.querySelector<HTMLElement>(".elapsed")
        if (elapsed) elapsed.textContent = duration(state)
      }, 1_000)
      signal.addEventListener("abort", () => window.clearInterval(timer), {
        once: true,
      })
      render()
      return {
        update(nextState) {
          if (!isGoalViewState(nextState)) {
            throw new TypeError("Goal adapter received invalid state update.")
          }
          state = nextState
          render()
        },
        dispose() {
          window.clearInterval(timer)
          root.remove()
          style.remove()
        },
      }
    },
  })
})
