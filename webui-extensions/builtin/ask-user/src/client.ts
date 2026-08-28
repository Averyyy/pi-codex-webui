import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import { parseAskParams, type AskParams, type AskResponse } from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  form { display: grid; gap: 16px; width: min(640px, 82vw); max-width: 100%; min-height: 0; max-height: min(72vh, 680px); }
  .prompt { display: grid; gap: 8px; }
  .question { margin: 0; font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
  .context { margin: 0; padding-left: 12px; border-left: 2px solid color-mix(in srgb, currentColor 20%, transparent); color: color-mix(in srgb, currentColor 68%, transparent); white-space: pre-wrap; overflow-wrap: anywhere; }
  .options { display: grid; gap: 8px; min-height: 0; overflow-y: auto; padding: 2px; border: 0; margin: 0; }
  .option { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 10px; align-items: start; padding: 10px 12px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 8px; cursor: pointer; }
  .option:hover { background: color-mix(in srgb, currentColor 5%, transparent); }
  .option:has(input:checked) { border-color: color-mix(in srgb, currentColor 42%, transparent); background: color-mix(in srgb, currentColor 8%, transparent); }
  input[type="radio"], input[type="checkbox"] { margin: 3px 0 0; accent-color: currentColor; }
  .option-copy { display: grid; gap: 2px; min-width: 0; }
  .option-title { font-weight: 600; }
  .description { color: color-mix(in srgb, currentColor 64%, transparent); font-size: 12px; overflow-wrap: anywhere; }
  .field { display: grid; gap: 6px; color: color-mix(in srgb, currentColor 70%, transparent); font-size: 12px; }
  textarea { width: 100%; min-height: 72px; resize: vertical; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; background: transparent; color: inherit; padding: 9px 10px; font: 13px/1.5 system-ui, sans-serif; }
  textarea:focus-visible, input:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; padding: 8px 13px; font: inherit; }
  button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 8%, transparent); }
  button.primary { background: CanvasText; color: Canvas; }
  button.primary:hover:not(:disabled) { opacity: .86; }
  button:disabled { cursor: not-allowed; opacity: .45; }
  @media (max-width: 620px) {
    form { width: 82vw; max-height: 76vh; }
  }
`

function addStyle(root: ShadowRoot) {
  const style = document.createElement("style")
  style.textContent = styles
  root.append(style)
  return style
}

function text(tag: "span" | "p", value: string, className?: string) {
  const element = document.createElement(tag)
  element.textContent = value
  if (className) element.className = className
  return element
}

function textarea(labelText: string, placeholder: string) {
  const label = document.createElement("label")
  label.className = "field"
  const control = document.createElement("textarea")
  control.placeholder = placeholder
  label.append(text("span", labelText), control)
  return { label, control }
}

function optionRow(
  input: HTMLInputElement,
  title: string,
  description?: string
) {
  const label = document.createElement("label")
  label.className = "option"
  const copy = document.createElement("span")
  copy.className = "option-copy"
  copy.append(text("span", title, "option-title"))
  if (description) copy.append(text("span", description, "description"))
  label.append(input, copy)
  return label
}

function mountDialog(
  container: HTMLElement,
  shadowRoot: ShadowRoot,
  state: AskParams,
  signal: AbortSignal,
  close: (result?: unknown) => void
) {
  const style = addStyle(shadowRoot)
  const form = document.createElement("form")
  const prompt = document.createElement("div")
  prompt.className = "prompt"
  prompt.append(text("p", state.question, "question"))
  if (state.context) prompt.append(text("p", state.context, "context"))

  const choices = document.createElement("fieldset")
  choices.className = "options"
  const group = `ask-user-${crypto.randomUUID()}`
  const optionInputs = state.options.map((item) => {
    const input = document.createElement("input")
    input.type = state.allowMultiple ? "checkbox" : "radio"
    input.name = group
    input.value = item.title
    choices.append(optionRow(input, item.title, item.description))
    return input
  })

  const freeform = textarea("自定义回答", "输入你的回答")
  if (!state.allowFreeform) freeform.label.hidden = true
  const comment = textarea("补充说明（可选）", "补充选择原因或约束")
  if (!state.allowComment) comment.label.hidden = true

  let freeformActive = state.options.length === 0
  const activateFreeform = () => {
    freeformActive = true
    for (const input of optionInputs) input.checked = false
    updateSubmit()
  }
  freeform.control.addEventListener("focus", activateFreeform, { signal })
  freeform.control.addEventListener("input", activateFreeform, { signal })
  for (const input of optionInputs) {
    input.addEventListener(
      "change",
      () => {
        freeformActive = false
        freeform.control.value = ""
        updateSubmit()
      },
      { signal }
    )
  }

  const actions = document.createElement("div")
  actions.className = "actions"
  const cancel = document.createElement("button")
  cancel.type = "button"
  cancel.textContent = "取消"
  cancel.addEventListener("click", () => close({ cancelled: true }), { signal })
  const submit = document.createElement("button")
  submit.type = "submit"
  submit.className = "primary"
  submit.textContent = "提交"
  actions.append(cancel, submit)

  function response(): AskResponse | null {
    const customAnswer = freeform.control.value.trim()
    if (state.allowFreeform && freeformActive) {
      return customAnswer ? { kind: "freeform", text: customAnswer } : null
    }
    const selections = optionInputs.flatMap((input) =>
      input.checked ? [input.value] : []
    )
    if (!selections.length) return null
    const note = comment.control.value.trim()
    return {
      kind: "selection",
      selections,
      ...(state.allowComment && note ? { comment: note } : {}),
    }
  }

  function updateSubmit() {
    submit.disabled = response() === null
  }

  freeform.control.addEventListener("input", updateSubmit, { signal })
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault()
      const answer = response()
      if (answer) close({ cancelled: false, response: answer })
    },
    { signal }
  )
  form.append(prompt)
  if (state.options.length) form.append(choices)
  if (state.allowFreeform) form.append(freeform.label)
  if (state.allowComment) form.append(comment.label)
  form.append(actions)
  container.append(form)
  updateSubmit()

  const firstControl =
    optionInputs[0] ?? (state.allowFreeform ? freeform.control : cancel)
  queueMicrotask(() => firstControl.focus())
  const timeout = state.timeout
    ? window.setTimeout(() => close({ cancelled: true }), state.timeout)
    : undefined

  return () => {
    if (timeout !== undefined) window.clearTimeout(timeout)
    form.remove()
    style.remove()
  }
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "ask-user.dialog",
    mount({ container, shadowRoot, state, signal, close }) {
      const dispose = mountDialog(
        container,
        shadowRoot,
        parseAskParams(state),
        signal,
        close
      )
      return { dispose }
    },
  })
})
