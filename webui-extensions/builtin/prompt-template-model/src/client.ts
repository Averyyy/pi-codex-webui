import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import {
  parsePromptTemplateMessageState,
  parsePromptTemplateStatusState,
  type CapturedOutputState,
  type PromptTemplateMessageState,
  type PromptTemplateStatusState,
  type SubagentState,
} from "./contract.js"

const styles = `
  :host { display: block; color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  .card { display: grid; gap: 12px; margin: 10px 0; overflow: hidden; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); border-radius: 14px; background: color-mix(in srgb, Canvas 97%, transparent); color: CanvasText; padding: 14px; }
  .card[data-failed="true"] { border-color: color-mix(in srgb, #dc2626 32%, transparent); }
  .header { display: flex; min-width: 0; align-items: center; gap: 9px; }
  .icon { display: grid; width: 22px; height: 22px; flex: none; place-items: center; border-radius: 999px; background: color-mix(in srgb, #16a34a 14%, transparent); color: #15803d; font-size: 12px; font-weight: 700; }
  [data-failed="true"] .icon { background: color-mix(in srgb, #dc2626 14%, transparent); color: #dc2626; }
  .title { min-width: 0; flex: 1; overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: color-mix(in srgb, currentColor 53%, transparent); font-size: 12px; }
  .path, .task, .command { margin: 0; overflow-wrap: anywhere; color: color-mix(in srgb, currentColor 63%, transparent); }
  .command { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { border-radius: 999px; background: color-mix(in srgb, currentColor 7%, transparent); padding: 2px 8px; color: color-mix(in srgb, currentColor 60%, transparent); font-size: 11px; }
  details { min-width: 0; }
  summary { cursor: pointer; color: color-mix(in srgb, currentColor 68%, transparent); font-size: 12px; user-select: none; }
  pre { max-height: 420px; margin: 8px 0 0; overflow: auto; border-radius: 9px; background: color-mix(in srgb, currentColor 5%, transparent); padding: 10px 11px; color: inherit; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .output-grid { display: grid; gap: 10px; }
  .parallel { display: grid; gap: 9px; }
  .task-card { display: grid; gap: 7px; border-left: 2px solid color-mix(in srgb, currentColor 15%, transparent); padding-left: 10px; }
  .task-card[data-failed="true"] { border-left-color: #dc2626; }
  .task-title { font-weight: 600; }
  .status { display: flex; min-width: 0; align-items: center; gap: 9px; border: 1px solid color-mix(in srgb, currentColor 10%, transparent); border-radius: 11px; background: color-mix(in srgb, Canvas 97%, transparent); color: CanvasText; padding: 8px 11px; }
  .status-dot { width: 7px; height: 7px; flex: none; border-radius: 999px; background: #d97706; box-shadow: 0 0 0 3px color-mix(in srgb, #d97706 14%, transparent); }
  .status-label { flex: none; font-size: 12px; font-weight: 650; }
  .status-text { min-width: 0; overflow: hidden; color: color-mix(in srgb, currentColor 60%, transparent); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
`

function addStyle(shadowRoot: ShadowRoot) {
  const style = document.createElement("style")
  style.textContent = styles
  shadowRoot.append(style)
  return style
}

function paragraph(className: string, text: string) {
  const element = document.createElement("p")
  element.className = className
  element.textContent = text
  return element
}

function header(titleText: string, metaText: string, failed = false) {
  const root = document.createElement("header")
  root.className = "header"
  const icon = document.createElement("span")
  icon.className = "icon"
  icon.textContent = failed ? "!" : "✓"
  const title = document.createElement("span")
  title.className = "title"
  title.textContent = titleText
  const meta = document.createElement("span")
  meta.className = "meta"
  meta.textContent = metaText
  root.append(icon, title, meta)
  return root
}

function tags(values: string[]) {
  const root = document.createElement("div")
  root.className = "tags"
  for (const value of values.filter(Boolean)) {
    const tag = document.createElement("span")
    tag.className = "tag"
    tag.textContent = value
    root.append(tag)
  }
  return root
}

function disclosure(label: string, content: string, open = false) {
  const details = document.createElement("details")
  details.open = open
  const summary = document.createElement("summary")
  summary.textContent = label
  const body = document.createElement("pre")
  body.textContent = content || "(empty)"
  details.append(summary, body)
  return details
}

function formatDuration(durationMs: number) {
  if (durationMs < 1_000) return `${durationMs}ms`
  if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)}s`
  return `${Math.round(durationMs / 1_000)}s`
}

function outputDisclosure(label: string, output: CapturedOutputState) {
  const suffix = [
    `${output.totalLines} line${output.totalLines === 1 ? "" : "s"}`,
    `${output.totalChars.toLocaleString()} chars`,
    output.truncated ? "capped" : "",
  ]
    .filter(Boolean)
    .join(" · ")
  return disclosure(`${label} · ${suffix}`, output.text)
}

function usageTags(state: SubagentState) {
  const usage = state.usage
  return [
    `${usage.turns} turn${usage.turns === 1 ? "" : "s"}`,
    `${state.toolCalls.length} tool${state.toolCalls.length === 1 ? "" : "s"}`,
    `in ${usage.input}`,
    `out ${usage.output}`,
    usage.cacheRead ? `cache read ${usage.cacheRead}` : "",
    usage.cacheWrite ? `cache write ${usage.cacheWrite}` : "",
    usage.cost ? `$${usage.cost.toFixed(4)}` : "",
    usage.model ?? state.model ?? "",
  ]
}

function renderSubagent(root: HTMLElement, state: SubagentState) {
  const failed = state.parallelResults.some((result) => result.isError)
  root.dataset.failed = String(failed)
  root.append(
    header(
      state.agent,
      state.context === "fork" ? "delegated · fork" : "delegated",
      failed
    )
  )
  if (state.task) root.append(paragraph("task", `Task: ${state.task}`))
  root.append(tags(usageTags(state)))
  if (state.parallelResults.length) {
    const parallel = document.createElement("div")
    parallel.className = "parallel"
    for (const result of state.parallelResults) {
      const task = document.createElement("section")
      task.className = "task-card"
      task.dataset.failed = String(result.isError)
      const title = document.createElement("span")
      title.className = "task-title"
      title.textContent = result.agent
      task.append(title)
      if (result.isError) {
        task.append(
          paragraph("task", result.errorText ?? "Delegated task failed.")
        )
      } else if (result.text) {
        task.append(disclosure("Result", result.text, true))
      }
      if (result.toolCalls.length) {
        task.append(
          disclosure(
            `${result.toolCalls.length} tool calls`,
            result.toolCalls.join("\n")
          )
        )
      }
      parallel.append(task)
    }
    root.append(parallel)
    return
  }
  if (state.toolCalls.length) {
    root.append(
      disclosure(
        `${state.toolCalls.length} tool calls`,
        state.toolCalls.join("\n")
      )
    )
  }
  if (state.text) root.append(disclosure("Result", state.text, true))
}

function renderMessage(state: PromptTemplateMessageState) {
  const root = document.createElement("article")
  root.className = "card"
  switch (state.kind) {
    case "skill":
      root.append(
        header(`Skill loaded: ${state.skillName}`, "prompt context"),
        paragraph("path", state.skillPath),
        disclosure("Skill content", state.skillContent)
      )
      break
    case "subagent":
      renderSubagent(root, state)
      break
    case "deterministic": {
      const failed = state.exitCode !== 0
      root.dataset.failed = String(failed)
      root.append(
        header(
          "Deterministic step",
          `${failed ? "failed" : "succeeded"} · exit ${state.exitCode} · ${formatDuration(state.durationMs)}`,
          failed
        ),
        paragraph("command", state.command),
        tags([
          `cwd ${state.cwd}`,
          state.resolvedScriptPath ? `script ${state.resolvedScriptPath}` : "",
          state.signal ? `signal ${state.signal}` : "",
          state.nonInteractive ? "non-interactive" : "interactive",
          state.timedOut ? "timed out" : "",
        ])
      )
      const outputs = document.createElement("div")
      outputs.className = "output-grid"
      outputs.append(
        outputDisclosure("stdout", state.stdout),
        outputDisclosure("stderr", state.stderr)
      )
      root.append(outputs)
      break
    }
    case "deterministic-complete": {
      const failed = state.status === "failed"
      root.dataset.failed = String(failed)
      root.append(
        header(
          "Deterministic complete",
          `${state.status} · exit ${state.exitCode}`,
          failed
        ),
        paragraph("task", `Prompt: ${state.promptName}`),
        tags(["model handoff skipped", state.timedOut ? "timed out" : ""])
      )
      break
    }
  }
  return root
}

function renderStatus(root: HTMLElement, state: PromptTemplateStatusState) {
  root.replaceChildren()
  const dot = document.createElement("span")
  dot.className = "status-dot"
  const label = document.createElement("span")
  label.className = "status-label"
  label.textContent = state.label
  const text = document.createElement("span")
  text.className = "status-text"
  text.textContent = state.text
  text.title = state.text
  root.append(dot, label, text)
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "prompt-template.message",
    mount({ shadowRoot, state }) {
      const message = parsePromptTemplateMessageState(state)
      const style = addStyle(shadowRoot)
      const root = renderMessage(message)
      shadowRoot.append(root)
      return {
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })

  web.registerView({
    id: "prompt-template.status",
    mount({ shadowRoot, state: initialState }) {
      let state = parsePromptTemplateStatusState(initialState)
      const style = addStyle(shadowRoot)
      const root = document.createElement("section")
      root.className = "status"
      renderStatus(root, state)
      shadowRoot.append(root)
      return {
        update(nextState) {
          state = parsePromptTemplateStatusState(nextState)
          renderStatus(root, state)
        },
        dispose() {
          root.remove()
          style.remove()
        },
      }
    },
  })
})
