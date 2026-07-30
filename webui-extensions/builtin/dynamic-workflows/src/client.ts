import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import {
  parseWorkflowState,
  type WorkflowRun,
  type WorkflowState,
} from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .root { display: grid; gap: 14px; width: min(860px, 86vw); max-width: 100%; }
  .header, .actions, .run-head, .run-controls { display: flex; align-items: center; gap: 8px; }
  .header { justify-content: space-between; }
  .intro, .empty, .meta, .active { margin: 0; color: color-mix(in srgb, currentColor 64%, transparent); }
  .runs { display: grid; gap: 9px; max-height: 52vh; overflow: auto; }
  .run { display: grid; gap: 8px; padding: 12px; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 11px; }
  .run-head { justify-content: space-between; align-items: flex-start; }
  .run-title { min-width: 0; }
  .run-title strong { display: block; overflow-wrap: anywhere; }
  code { font: 11px/1.4 ui-monospace, monospace; color: color-mix(in srgb, currentColor 60%, transparent); overflow-wrap: anywhere; }
  .badge { flex: none; border-radius: 999px; padding: 2px 8px; background: color-mix(in srgb, currentColor 8%, transparent); font-size: 11px; }
  .progress { height: 5px; overflow: hidden; border-radius: 99px; background: color-mix(in srgb, currentColor 10%, transparent); }
  .progress span { display: block; height: 100%; background: currentColor; }
  .run-controls { justify-content: flex-end; flex-wrap: wrap; }
  form { display: flex; gap: 8px; }
  input { min-width: 0; flex: 1; border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; padding: 9px 10px; font: inherit; }
  input:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; padding: 8px 11px; }
  button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  button:disabled { opacity: .5; cursor: wait; }
  .primary { background: currentColor; color: Canvas; }
  .primary:hover:not(:disabled) { background: currentColor; opacity: .86; }
  .feedback { min-height: 20px; margin: 0; font-size: 12px; white-space: pre-wrap; }
  .error { color: #dc2626; }
`

function addStyle(root: ShadowRoot) {
  const style = document.createElement("style")
  style.textContent = styles
  root.append(style)
  return style
}

function runCard(
  run: WorkflowRun,
  onControl: (action: "pause" | "resume" | "stop", runId: string) => void,
  signal: AbortSignal
) {
  const card = document.createElement("article")
  card.className = "run"
  const head = document.createElement("div")
  head.className = "run-head"
  const title = document.createElement("div")
  title.className = "run-title"
  const name = document.createElement("strong")
  name.textContent = run.workflowName
  const id = document.createElement("code")
  id.textContent = run.runId
  title.append(name, id)
  const status = document.createElement("span")
  status.className = "badge"
  status.textContent = run.status
  head.append(title, status)

  const total = Math.max(0, run.counts.total)
  const done = Math.max(0, run.counts.done + run.counts.skipped)
  const progress = document.createElement("div")
  progress.className = "progress"
  const progressValue = document.createElement("span")
  progressValue.style.width = `${total ? Math.min(100, (done / total) * 100) : 0}%`
  progress.append(progressValue)
  const meta = document.createElement("p")
  meta.className = "meta"
  meta.textContent = `${done}/${total} 完成 · ${run.counts.running} 运行 · ${run.counts.queued} 排队 · ${run.tokenTotal.toLocaleString()} tokens${run.phase ? ` · ${run.phase}` : ""}`
  const active = document.createElement("p")
  active.className = "active"
  active.textContent = run.activeLabels.length
    ? `正在执行：${run.activeLabels.join("、")}`
    : "当前没有活动步骤"
  const controls = document.createElement("div")
  controls.className = "run-controls"
  const verbs: Array<["pause" | "resume" | "stop", string]> = []
  if (run.status === "running") verbs.push(["pause", "暂停"])
  if (run.status === "paused") verbs.push(["resume", "继续"])
  if (run.status === "running" || run.status === "paused") {
    verbs.push(["stop", "停止"])
  }
  for (const [verb, label] of verbs) {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.control = "true"
    button.textContent = label
    button.addEventListener("click", () => onControl(verb, run.runId), {
      signal,
    })
    controls.append(button)
  }
  card.append(head, progress, meta, active, controls)
  return card
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "dynamic-workflows.manager",
    mount({ shadowRoot, state, invoke, close, signal }) {
      let current: WorkflowState = parseWorkflowState(state)
      let busy = false
      const style = addStyle(shadowRoot)
      const root = document.createElement("section")
      root.className = "root"
      const header = document.createElement("div")
      header.className = "header"
      const intro = document.createElement("p")
      intro.className = "intro"
      intro.textContent =
        "工作流引擎继续在 Pi Worker 中运行；此面板只管理真实 run。"
      const headerActions = document.createElement("div")
      headerActions.className = "actions"
      const refresh = document.createElement("button")
      refresh.type = "button"
      refresh.textContent = "刷新"
      const closeButton = document.createElement("button")
      closeButton.type = "button"
      closeButton.textContent = "关闭"
      closeButton.addEventListener("click", () => close(), { signal })
      headerActions.append(refresh, closeButton)
      header.append(intro, headerActions)
      const runs = document.createElement("div")
      runs.className = "runs"
      const feedback = document.createElement("p")
      feedback.className = "feedback"
      const form = document.createElement("form")
      const prompt = document.createElement("input")
      prompt.placeholder = "输入新工作流目标"
      prompt.required = true
      const start = document.createElement("button")
      start.type = "submit"
      start.className = "primary"
      start.textContent = "启动工作流"
      form.append(prompt, start)
      root.append(header, runs, feedback, form)
      shadowRoot.append(root)

      const setBusy = (value: boolean) => {
        busy = value
        refresh.disabled = value
        start.disabled = value
        for (const button of runs.querySelectorAll<HTMLButtonElement>(
          "button[data-control]"
        )) {
          button.disabled = value
        }
      }
      const control = async (
        action: "refresh" | "pause" | "resume" | "stop",
        runId?: string
      ) => {
        if (busy) return
        setBusy(true)
        feedback.textContent =
          action === "refresh" ? "正在刷新…" : `正在${action} ${runId}…`
        feedback.classList.remove("error")
        try {
          render(await invoke("dynamic-workflows.control", { action, runId }))
        } catch (error) {
          feedback.textContent =
            error instanceof Error ? error.message : String(error)
          feedback.classList.add("error")
        } finally {
          setBusy(false)
        }
      }
      const render = (next: unknown) => {
        current = parseWorkflowState(next)
        runs.replaceChildren()
        if (!current.runs.length) {
          const empty = document.createElement("p")
          empty.className = "empty"
          empty.textContent = "还没有工作流 run。"
          runs.append(empty)
        } else {
          for (const run of current.runs) {
            runs.append(
              runCard(run, (verb, id) => void control(verb, id), signal)
            )
          }
        }
        feedback.textContent = current.error ?? current.output ?? ""
        feedback.classList.toggle("error", Boolean(current.error))
      }
      refresh.addEventListener("click", () => void control("refresh"), {
        signal,
      })
      form.addEventListener(
        "submit",
        (event) => {
          event.preventDefault()
          const value = prompt.value.trim()
          if (value) close({ commandArgs: `run ${value}` })
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
