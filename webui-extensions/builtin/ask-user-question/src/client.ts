import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import {
  parseAskUserDialogState,
  type AskUserDialogResponse,
  type QuestionData,
} from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  form { display: grid; gap: 16px; width: min(760px, 82vw); max-width: 100%; max-height: min(72vh, 760px); }
  .questions { display: grid; gap: 14px; overflow-y: auto; padding: 2px 4px 2px 2px; }
  fieldset { min-width: 0; margin: 0; padding: 14px; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 12px; }
  legend { padding: 0 6px; font-size: 12px; font-weight: 650; color: color-mix(in srgb, currentColor 68%, transparent); }
  .question { margin: 0 0 12px; font-weight: 650; }
  .options { display: grid; gap: 8px; }
  .option { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 10px; align-items: start; padding: 10px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 10px; cursor: pointer; }
  .option:has(input:checked) { border-color: color-mix(in srgb, currentColor 45%, transparent); background: color-mix(in srgb, currentColor 7%, transparent); }
  input[type="radio"], input[type="checkbox"] { margin-top: 3px; accent-color: currentColor; }
  .option-copy { display: grid; gap: 2px; min-width: 0; }
  .option-label { font-weight: 600; }
  .description { color: color-mix(in srgb, currentColor 68%, transparent); font-size: 12px; overflow-wrap: anywhere; }
  .preview { grid-column: 2; max-height: 180px; overflow: auto; margin: 6px 0 0; padding: 9px 10px; border-radius: 8px; background: color-mix(in srgb, currentColor 6%, transparent); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, monospace; }
  .field { display: grid; gap: 5px; margin-top: 10px; color: color-mix(in srgb, currentColor 72%, transparent); font-size: 12px; }
  textarea { width: 100%; min-height: 68px; resize: vertical; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 9px; background: transparent; color: inherit; padding: 8px 10px; font: 13px/1.5 system-ui, sans-serif; }
  textarea:focus-visible, input:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .custom { min-height: 78px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; padding: 8px 13px; font: inherit; }
  button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  button.primary { background: currentColor; color: Canvas; }
  button.primary:hover { opacity: .86; }
  @media (max-width: 620px) {
    form { width: 82vw; max-height: 76vh; }
    fieldset { padding: 11px; }
  }
`

interface QuestionControls {
  question: QuestionData
  optionInputs: HTMLInputElement[]
  customChoice?: HTMLInputElement
  customAnswer: HTMLTextAreaElement
  notes: HTMLTextAreaElement
  noneChoice?: HTMLInputElement
  multiTouched: () => boolean
  customActive: () => boolean
}

function addStyle(root: ShadowRoot) {
  const style = document.createElement("style")
  style.textContent = styles
  root.append(style)
  return style
}

function text(tag: "span" | "p" | "legend", value: string, className?: string) {
  const element = document.createElement(tag)
  element.textContent = value
  if (className) element.className = className
  return element
}

function optionRow(
  input: HTMLInputElement,
  labelText: string,
  description: string,
  preview?: string
) {
  const label = document.createElement("label")
  label.className = "option"
  const copy = document.createElement("span")
  copy.className = "option-copy"
  copy.append(
    text("span", labelText, "option-label"),
    text("span", description, "description")
  )
  label.append(input, copy)
  if (preview) {
    const value = document.createElement("pre")
    value.className = "preview"
    value.textContent = preview
    label.append(value)
  }
  return label
}

function textareaField(labelText: string, className?: string) {
  const label = document.createElement("label")
  label.className = "field"
  const control = document.createElement("textarea")
  if (className) control.className = className
  label.append(labelText, control)
  return { label, control }
}

function buildQuestion(
  question: QuestionData,
  questionIndex: number,
  signal: AbortSignal
): { element: HTMLFieldSetElement; controls: QuestionControls } {
  const fieldset = document.createElement("fieldset")
  fieldset.append(
    text("legend", question.header || `问题 ${questionIndex + 1}`),
    text("p", question.question, "question")
  )
  const options = document.createElement("div")
  options.className = "options"
  const optionInputs: HTMLInputElement[] = []
  let multiTouched = false
  let customActive = false
  const groupName = `ask-user-question-${questionIndex}`
  const custom = textareaField(
    question.multiSelect ? "自定义答案（将替代已选选项）" : "自定义答案",
    "custom"
  )

  for (const [optionIndex, option] of question.options.entries()) {
    const input = document.createElement("input")
    input.type = question.multiSelect ? "checkbox" : "radio"
    input.name = groupName
    input.value = String(optionIndex)
    optionInputs.push(input)
    options.append(
      optionRow(input, option.label, option.description, option.preview)
    )
  }

  let customChoice: HTMLInputElement | undefined
  let noneChoice: HTMLInputElement | undefined
  if (question.multiSelect) {
    noneChoice = document.createElement("input")
    noneChoice.type = "checkbox"
    options.append(
      optionRow(noneChoice, "不选择任何选项", "确认此题不选择预设选项。")
    )
    for (const input of optionInputs) {
      input.addEventListener(
        "change",
        () => {
          multiTouched = true
          customActive = false
          custom.control.value = ""
          if (input.checked && noneChoice) noneChoice.checked = false
        },
        { signal }
      )
    }
    noneChoice.addEventListener(
      "change",
      () => {
        multiTouched = true
        if (!noneChoice?.checked) return
        for (const input of optionInputs) input.checked = false
        customActive = false
        custom.control.value = ""
      },
      { signal }
    )
    const activateCustom = () => {
      customActive = true
      multiTouched = true
      for (const input of optionInputs) input.checked = false
      if (noneChoice) noneChoice.checked = false
    }
    custom.control.addEventListener("focus", activateCustom, { signal })
    custom.control.addEventListener("input", activateCustom, { signal })
  } else {
    customChoice = document.createElement("input")
    customChoice.type = "radio"
    customChoice.name = groupName
    customChoice.value = "custom"
    options.append(
      optionRow(customChoice, "自定义答案", "输入不在预设选项中的答案。")
    )
    const activateCustom = () => {
      customChoice!.checked = true
      customActive = true
    }
    custom.control.addEventListener("focus", activateCustom, { signal })
    custom.control.addEventListener("input", activateCustom, { signal })
    for (const input of optionInputs) {
      input.addEventListener(
        "change",
        () => {
          if (input.checked) customActive = false
        },
        { signal }
      )
    }
  }

  const note = textareaField("备注（可选）")
  fieldset.append(options, custom.label, note.label)
  return {
    element: fieldset,
    controls: {
      question,
      optionInputs,
      ...(customChoice ? { customChoice } : {}),
      customAnswer: custom.control,
      notes: note.control,
      ...(noneChoice ? { noneChoice } : {}),
      multiTouched: () => multiTouched,
      customActive: () => customActive,
    },
  }
}

function response(
  controls: QuestionControls,
  questionIndex: number
): AskUserDialogResponse | undefined {
  const note = controls.notes.value.trim()
  const withNotes = note ? { notes: note } : {}
  if (controls.question.multiSelect) {
    if (controls.customActive()) {
      return {
        questionIndex,
        kind: "custom",
        answer: controls.customAnswer.value || null,
        ...withNotes,
      }
    }
    const selectedIndices = controls.optionInputs.flatMap((input, index) =>
      input.checked ? [index] : []
    )
    if (
      !selectedIndices.length &&
      !controls.noneChoice?.checked &&
      !controls.multiTouched()
    ) {
      return undefined
    }
    return {
      questionIndex,
      kind: "multi",
      selectedIndices,
      ...withNotes,
    }
  }

  const optionIndex = controls.optionInputs.findIndex((input) => input.checked)
  if (optionIndex >= 0) {
    return {
      questionIndex,
      kind: "option",
      optionIndex,
      ...withNotes,
    }
  }
  if (controls.customChoice?.checked) {
    return {
      questionIndex,
      kind: "custom",
      answer: controls.customAnswer.value || null,
      ...withNotes,
    }
  }
  return undefined
}

export default defineClientExtension((web) => {
  web.registerView({
    id: "ask-user-question.dialog",
    mount({ container, shadowRoot, state, close, signal }) {
      const parsed = parseAskUserDialogState(state)
      const style = addStyle(shadowRoot)
      const form = document.createElement("form")
      const questions = document.createElement("div")
      questions.className = "questions"
      const controls: QuestionControls[] = []
      for (const [index, question] of parsed.questions.entries()) {
        const built = buildQuestion(question, index, signal)
        controls.push(built.controls)
        questions.append(built.element)
      }

      const actions = document.createElement("div")
      actions.className = "actions"
      const cancel = document.createElement("button")
      cancel.type = "button"
      cancel.textContent = "取消"
      const submit = document.createElement("button")
      submit.type = "submit"
      submit.className = "primary"
      submit.textContent = "提交答案"
      actions.append(cancel, submit)
      form.append(questions, actions)
      container.append(form)

      const result = (cancelled: boolean) => ({
        cancelled,
        responses: controls.flatMap((item, index) => {
          const answer = response(item, index)
          return answer ? [answer] : []
        }),
      })
      cancel.addEventListener("click", () => close(result(true)), { signal })
      form.addEventListener(
        "submit",
        (event) => {
          event.preventDefault()
          close(result(false))
        },
        { signal }
      )

      return {
        dispose() {
          form.remove()
          style.remove()
        },
      }
    },
  })
})
