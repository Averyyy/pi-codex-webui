import { defineClientExtension } from "@pi-web-codex/extension-sdk"

import {
  parseAskUserDialogState,
  type AskUserDialogResponse,
  type QuestionData,
} from "./contract.js"

const styles = `
  :host { color: inherit; font: 14px/1.5 system-ui, sans-serif; }
  * { box-sizing: border-box; }
  form { display: grid; gap: 14px; width: min(760px, 82vw); max-width: 100%; min-height: 0; max-height: min(72vh, 760px); }
  .tabs { display: flex; gap: 5px; overflow-x: auto; padding: 2px; border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent); }
  .tab { flex: 0 0 auto; border: 0; border-radius: 7px; padding: 6px 9px; color: color-mix(in srgb, currentColor 58%, transparent); }
  .tab.active { background: color-mix(in srgb, currentColor 10%, transparent); color: inherit; font-weight: 650; }
  .tab.answered::before { content: "✓ "; color: color-mix(in srgb, currentColor 65%, transparent); }
  .questions { display: grid; min-height: 0; overflow-y: auto; padding: 2px 4px 2px 2px; }
  fieldset { min-width: 0; margin: 0; padding: 14px; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 12px; }
  legend { padding: 0 6px; font-size: 12px; font-weight: 650; color: color-mix(in srgb, currentColor 68%, transparent); }
  .question { margin: 0 0 12px; font-weight: 650; }
  .options { display: grid; gap: 8px; }
  .option { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 10px; align-items: start; padding: 10px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 10px; cursor: pointer; }
  .option:has(input:checked) { border-color: color-mix(in srgb, currentColor 45%, transparent); background: color-mix(in srgb, currentColor 7%, transparent); }
  input[type="radio"], input[type="checkbox"] { margin-top: 3px; accent-color: currentColor; }
  .custom-option { align-items: start; }
  .custom-option textarea { min-height: 40px; margin: -2px 0 0; }
  .option-copy { display: grid; gap: 2px; min-width: 0; }
  .option-label { font-weight: 600; }
  .description { color: color-mix(in srgb, currentColor 68%, transparent); font-size: 12px; overflow-wrap: anywhere; }
  .preview { grid-column: 2; max-height: 180px; overflow: auto; margin: 6px 0 0; padding: 9px 10px; border-radius: 8px; background: color-mix(in srgb, currentColor 6%, transparent); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 ui-monospace, monospace; }
  .field { display: grid; gap: 5px; margin-top: 10px; color: color-mix(in srgb, currentColor 72%, transparent); font-size: 12px; }
  textarea { width: 100%; min-height: 68px; resize: vertical; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 9px; background: transparent; color: inherit; padding: 8px 10px; font: 13px/1.5 system-ui, sans-serif; }
  textarea:focus-visible, input:focus-visible, button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .custom { min-height: 78px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
  .actions .spacer { flex: 1; }
  .review { display: grid; gap: 10px; padding: 4px 2px; overflow-y: auto; }
  .review h2 { margin: 0; font-size: 15px; }
  .review p { margin: 0; color: color-mix(in srgb, currentColor 68%, transparent); }
  .review-item { display: grid; gap: 3px; padding: 10px 12px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 10px; }
  .review-item strong { font-size: 12px; }
  .review-item span { color: color-mix(in srgb, currentColor 68%, transparent); overflow-wrap: anywhere; }
  .review-warning { color: #b45309 !important; }
  button { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; padding: 8px 13px; font: inherit; }
  button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
  button.primary { background: CanvasText; color: Canvas; }
  button.primary:hover { opacity: .86; }
  @media (max-width: 620px) {
    form { width: 82vw; max-height: 76vh; }
    fieldset { padding: 11px; }
  }
`

interface QuestionControls {
  question: QuestionData
  element: HTMLFieldSetElement
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

function customOptionRow(
  input: HTMLInputElement,
  answer: HTMLTextAreaElement,
  labelText: string,
  description: string
) {
  const label = document.createElement("label")
  label.className = "option custom-option"
  const copy = document.createElement("span")
  copy.className = "option-copy"
  copy.append(
    text("span", labelText, "option-label"),
    text("span", description, "description"),
    answer
  )
  label.append(input, copy)
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
  const custom = textareaField("", "custom")
  custom.control.placeholder = "输入内容"
  custom.control.setAttribute("aria-label", "输入内容")

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
    customChoice = document.createElement("input")
    customChoice.type = "checkbox"
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
          if (customChoice) customChoice.checked = false
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
        if (customChoice) customChoice.checked = false
      },
      { signal }
    )
    const activateCustom = () => {
      customActive = true
      multiTouched = true
      for (const input of optionInputs) input.checked = false
      if (noneChoice) noneChoice.checked = false
      if (customChoice) customChoice.checked = true
    }
    customChoice.addEventListener(
      "change",
      () => {
        if (customChoice?.checked) {
          activateCustom()
        } else {
          customActive = false
          custom.control.value = ""
        }
      },
      { signal }
    )
    custom.control.addEventListener("focus", activateCustom, { signal })
    custom.control.addEventListener("input", activateCustom, { signal })
    options.append(
      customOptionRow(
        customChoice,
        custom.control,
        "输入内容",
        "输入自定义答案（将替代已选选项）。"
      )
    )
  } else {
    customChoice = document.createElement("input")
    customChoice.type = "radio"
    customChoice.name = groupName
    customChoice.value = "custom"
    options.append(
      customOptionRow(
        customChoice,
        custom.control,
        "输入内容",
        "输入不在预设选项中的答案。"
      )
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
  fieldset.append(options, note.label)
  return {
    element: fieldset,
    controls: {
      question,
      element: fieldset,
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
      const tabs = document.createElement("div")
      tabs.className = "tabs"
      const questions = document.createElement("div")
      questions.className = "questions"
      const controls: QuestionControls[] = []
      const globalNote = textareaField("整体备注（可选）")
      for (const [index, question] of parsed.questions.entries()) {
        const built = buildQuestion(question, index, signal)
        controls.push(built.controls)
      }

      let activeTab = 0
      const reviewTabIndex = parsed.questions.length

      const answerText = (item: QuestionControls, index: number) => {
        const answer = response(item, index)
        if (!answer) return "未回答"
        if (answer.kind === "option") {
          return item.question.options[answer.optionIndex]?.label ?? "未回答"
        }
        if (answer.kind === "custom") return answer.answer || "自定义答案（空）"
        return answer.selectedIndices.length
          ? answer.selectedIndices
              .map((optionIndex) => item.question.options[optionIndex]?.label)
              .filter(Boolean)
              .join("、")
          : "不选择任何选项"
      }

      const renderTabs = () => {
        tabs.replaceChildren()
        if (parsed.questions.length < 2) return
        for (const [index, question] of parsed.questions.entries()) {
          const tab = document.createElement("button")
          tab.type = "button"
          tab.className = "tab"
          tab.textContent = question.header || `问题 ${index + 1}`
          tab.setAttribute("role", "tab")
          tab.setAttribute("aria-selected", String(activeTab === index))
          if (activeTab === index) tab.classList.add("active")
          if (response(controls[index]!, index)) tab.classList.add("answered")
          tab.addEventListener(
            "click",
            () => {
              activeTab = index
              render()
            },
            { signal }
          )
          tabs.append(tab)
        }
        const review = document.createElement("button")
        review.type = "button"
        review.className = "tab"
        review.textContent = "检查并提交"
        review.setAttribute("role", "tab")
        review.setAttribute(
          "aria-selected",
          String(activeTab === reviewTabIndex)
        )
        if (activeTab === reviewTabIndex) review.classList.add("active")
        review.addEventListener(
          "click",
          () => {
            activeTab = reviewTabIndex
            render()
          },
          { signal }
        )
        tabs.append(review)
      }

      const renderContent = () => {
        questions.replaceChildren()
        if (activeTab < reviewTabIndex) {
          questions.append(controls[activeTab]!.element)
          return
        }
        const review = document.createElement("div")
        review.className = "review"
        const heading = document.createElement("h2")
        heading.textContent = "检查你的答案"
        review.append(heading)
        const unanswered = controls.filter(
          (item, index) => !response(item, index)
        )
        if (unanswered.length) {
          const warning = document.createElement("p")
          warning.className = "review-warning"
          warning.textContent = `还有 ${unanswered.length} 个问题未回答；仍可提交。`
          review.append(warning)
        }
        controls.forEach((item, index) => {
          const row = document.createElement("div")
          row.className = "review-item"
          const question = document.createElement("strong")
          question.textContent = item.question.question
          const answer = document.createElement("span")
          answer.textContent = answerText(item, index)
          row.append(question, answer)
          review.append(row)
        })
        review.append(globalNote.label)
        questions.append(review)
      }

      const actions = document.createElement("div")
      actions.className = "actions"
      const cancel = document.createElement("button")
      cancel.type = "button"
      cancel.textContent = "取消"
      const submit = document.createElement("button")
      submit.type = "submit"
      submit.className = "primary"
      const back = document.createElement("button")
      back.type = "button"
      back.textContent = "上一个"
      const spacer = document.createElement("span")
      spacer.className = "spacer"
      actions.append(back, spacer, cancel, submit)
      form.append(tabs, questions, actions)
      container.append(form)

      const render = () => {
        renderTabs()
        renderContent()
        back.hidden = activeTab === 0
        back.disabled = activeTab === 0
        submit.textContent =
          activeTab === reviewTabIndex ? "提交答案" : "下一题"
        submit.type = "submit"
      }

      render()

      const result = (cancelled: boolean) => {
        const note = globalNote.control.value.trim()
        return {
          cancelled,
          responses: controls.flatMap((item, index) => {
            const answer = response(item, index)
            return answer ? [answer] : []
          }),
          ...(note ? { globalNote: note } : {}),
        }
      }
      cancel.addEventListener("click", () => close(result(true)), { signal })
      form.addEventListener(
        "submit",
        (event) => {
          event.preventDefault()
          if (activeTab < reviewTabIndex) {
            activeTab += 1
            render()
            return
          }
          close(result(false))
        },
        { signal }
      )
      back.addEventListener(
        "click",
        () => {
          if (activeTab === 0) return
          activeTab -= 1
          render()
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
