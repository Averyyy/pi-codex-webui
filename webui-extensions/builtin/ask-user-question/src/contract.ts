export const ASK_USER_QUESTION_TOOL = "ask_user_question"
export const ASK_USER_PROMPT_EVENT = "rpiv:ask-user:prompt"
export const ASK_USER_BLOCKED_EVENT = "rpiv:ask-user:blocked"

export const MAX_QUESTIONS = 4
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 4
export const MAX_HEADER_LENGTH = 16
export const MAX_LABEL_LENGTH = 60
export const RESERVED_LABELS = ["Other", "Type something.", "Next"] as const

export const DECLINE_MESSAGE = "User declined to answer questions"
export const ENVELOPE_PREFIX = "User has answered your questions:"
export const ENVELOPE_SUFFIX =
  "You can now continue with the user's answers in mind."
export const NO_INPUT_PLACEHOLDER = "(no input)"

export const ERROR_NO_QUESTIONS = "Error: At least one question is required"
export const ERROR_TOO_MANY_QUESTIONS =
  "Error: At most 4 questions are allowed per invocation"
export const ERROR_DUPLICATE_QUESTION =
  "Error: Question text must be unique within an invocation"
export const ERROR_TOO_FEW_OPTIONS =
  "Error: Each question requires at least 2 options"
export const ERROR_RESERVED_LABEL =
  "Error: Option label is reserved (Other, Type something., Next)"
export const ERROR_DUPLICATE_OPTION_LABEL =
  "Error: Option labels must be unique within a question"

export interface QuestionOption {
  label: string
  description: string
  preview?: string
}

export interface QuestionData {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect?: boolean
}

export interface QuestionParams {
  questions: QuestionData[]
}

export interface QuestionAnswer {
  questionIndex: number
  question: string
  kind: "option" | "custom" | "multi"
  answer: string | null
  selected?: string[]
  notes?: string
  preview?: string
}

export type QuestionnaireError =
  | "no_questions"
  | "empty_options"
  | "too_many_questions"
  | "duplicate_question"
  | "duplicate_option_label"
  | "reserved_label"

export interface QuestionnaireResult {
  answers: QuestionAnswer[]
  cancelled: boolean
  error?: QuestionnaireError
}

export interface AskUserDialogState {
  questions: QuestionData[]
}

export type AskUserDialogResponse =
  | {
      questionIndex: number
      kind: "option"
      optionIndex: number
      notes?: string
    }
  | {
      questionIndex: number
      kind: "custom"
      answer: string | null
      notes?: string
    }
  | {
      questionIndex: number
      kind: "multi"
      selectedIndices: number[]
      notes?: string
    }

export interface AskUserDialogResult {
  cancelled: boolean
  responses?: AskUserDialogResponse[]
}

export interface AskUserPromptEventPayload {
  questions: Array<{
    question: string
    header: string
    multiSelect: boolean
    options: Array<{
      label: string
      description: string
      hasPreview: boolean
    }>
  }>
}

export type ValidationResult =
  | { ok: true }
  | {
      ok: false
      error: QuestionnaireError
      message: string
    }

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function graphemeLength(value: string) {
  return Array.from(graphemes.segment(value)).length
}

function requiredString(
  value: unknown,
  field: string,
  maxLength?: number
): string {
  if (typeof value !== "string") {
    throw new TypeError(`Invalid ask_user_question ${field}.`)
  }
  if (maxLength !== undefined && graphemeLength(value) > maxLength) {
    throw new TypeError(
      `Invalid ask_user_question ${field}: maximum length is ${maxLength}.`
    )
  }
  return value
}

function parseOption(
  value: unknown,
  questionIndex: number,
  optionIndex: number
): QuestionOption {
  const option = record(value)
  const prefix = `questions[${questionIndex}].options[${optionIndex}]`
  if (!option) throw new TypeError(`Invalid ask_user_question ${prefix}.`)
  const preview = option.preview
  if (preview !== undefined && typeof preview !== "string") {
    throw new TypeError(`Invalid ask_user_question ${prefix}.preview.`)
  }
  return {
    label: requiredString(option.label, `${prefix}.label`, MAX_LABEL_LENGTH),
    description: requiredString(option.description, `${prefix}.description`),
    ...(preview === undefined ? {} : { preview }),
  }
}

function parseQuestion(value: unknown, index: number): QuestionData {
  const question = record(value)
  const prefix = `questions[${index}]`
  if (!question) throw new TypeError(`Invalid ask_user_question ${prefix}.`)
  if (!Array.isArray(question.options)) {
    throw new TypeError(`Invalid ask_user_question ${prefix}.options.`)
  }
  if (question.options.length > MAX_OPTIONS) {
    throw new TypeError(
      `Invalid ask_user_question ${prefix}.options: maximum length is ${MAX_OPTIONS}.`
    )
  }
  if (
    question.multiSelect !== undefined &&
    typeof question.multiSelect !== "boolean"
  ) {
    throw new TypeError(`Invalid ask_user_question ${prefix}.multiSelect.`)
  }
  return {
    question: requiredString(question.question, `${prefix}.question`),
    header: requiredString(
      question.header,
      `${prefix}.header`,
      MAX_HEADER_LENGTH
    ),
    options: question.options.map((option, optionIndex) =>
      parseOption(option, index, optionIndex)
    ),
    ...(question.multiSelect === undefined
      ? {}
      : { multiSelect: question.multiSelect }),
  }
}

export function parseQuestionParams(value: unknown): QuestionParams {
  const params = record(value)
  if (!params || !Array.isArray(params.questions)) {
    throw new TypeError("Invalid ask_user_question questions.")
  }
  return {
    questions: params.questions.map(parseQuestion),
  }
}

export function validateQuestionnaire(
  params: QuestionParams
): ValidationResult {
  if (params.questions.length === 0) {
    return {
      ok: false,
      error: "no_questions",
      message: ERROR_NO_QUESTIONS,
    }
  }
  if (params.questions.length > MAX_QUESTIONS) {
    return {
      ok: false,
      error: "too_many_questions",
      message: ERROR_TOO_MANY_QUESTIONS,
    }
  }

  const seenQuestions = new Set<string>()
  for (const question of params.questions) {
    if (seenQuestions.has(question.question)) {
      return {
        ok: false,
        error: "duplicate_question",
        message: ERROR_DUPLICATE_QUESTION,
      }
    }
    seenQuestions.add(question.question)
  }

  const reserved = new Set<string>(RESERVED_LABELS)
  for (const question of params.questions) {
    if (question.options.length < MIN_OPTIONS) {
      return {
        ok: false,
        error: "empty_options",
        message: ERROR_TOO_FEW_OPTIONS,
      }
    }
    const labels = new Set<string>()
    for (const option of question.options) {
      if (reserved.has(option.label)) {
        return {
          ok: false,
          error: "reserved_label",
          message: ERROR_RESERVED_LABEL,
        }
      }
      if (labels.has(option.label)) {
        return {
          ok: false,
          error: "duplicate_option_label",
          message: ERROR_DUPLICATE_OPTION_LABEL,
        }
      }
      labels.add(option.label)
    }
  }
  return { ok: true }
}

export function parseAskUserDialogState(value: unknown): AskUserDialogState {
  const state = record(value)
  const params = parseQuestionParams(
    state && "questions" in state ? { questions: state.questions } : undefined
  )
  const validation = validateQuestionnaire(params)
  if (!validation.ok) throw new TypeError(validation.message)
  return params
}

function notes(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new TypeError(`Invalid ask_user_question ${field}.`)
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function integer(value: unknown, field: string) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Invalid ask_user_question ${field}.`)
  }
  return value as number
}

function parseDialogResponse(
  value: unknown,
  params: QuestionParams
): QuestionAnswer {
  const response = record(value)
  if (!response) {
    throw new TypeError("Invalid ask_user_question dialog response.")
  }
  const questionIndex = integer(response.questionIndex, "dialog questionIndex")
  const question = params.questions[questionIndex]
  if (!question) {
    throw new TypeError("Invalid ask_user_question dialog questionIndex.")
  }
  const responseNotes = notes(response.notes, "dialog notes")

  if (response.kind === "option") {
    if (question.multiSelect === true) {
      throw new TypeError(
        "Invalid ask_user_question option response for multi-select question."
      )
    }
    const optionIndex = integer(response.optionIndex, "dialog optionIndex")
    const option = question.options[optionIndex]
    if (!option) {
      throw new TypeError("Invalid ask_user_question dialog optionIndex.")
    }
    return {
      questionIndex,
      question: question.question,
      kind: "option",
      answer: option.label,
      ...(responseNotes ? { notes: responseNotes } : {}),
      ...(option.preview ? { preview: option.preview } : {}),
    }
  }

  if (response.kind === "custom") {
    if (response.answer !== null && typeof response.answer !== "string") {
      throw new TypeError("Invalid ask_user_question dialog custom answer.")
    }
    return {
      questionIndex,
      question: question.question,
      kind: "custom",
      answer: response.answer,
      ...(responseNotes ? { notes: responseNotes } : {}),
    }
  }

  if (response.kind === "multi") {
    if (question.multiSelect !== true) {
      throw new TypeError(
        "Invalid ask_user_question multi response for single-select question."
      )
    }
    if (!Array.isArray(response.selectedIndices)) {
      throw new TypeError("Invalid ask_user_question dialog selectedIndices.")
    }
    const selectedIndices = [
      ...new Set(
        response.selectedIndices.map((selected, index) =>
          integer(selected, `dialog selectedIndices[${index}]`)
        )
      ),
    ].sort((a, b) => a - b)
    const selected = selectedIndices.map((optionIndex) => {
      const option = question.options[optionIndex]
      if (!option) {
        throw new TypeError("Invalid ask_user_question dialog selected option.")
      }
      return option.label
    })
    return {
      questionIndex,
      question: question.question,
      kind: "multi",
      answer: null,
      selected,
      ...(responseNotes ? { notes: responseNotes } : {}),
    }
  }

  throw new TypeError("Invalid ask_user_question dialog response kind.")
}

export function parseAskUserDialogResult(
  value: unknown,
  params: QuestionParams
): QuestionnaireResult {
  if (value === undefined || value === null) {
    return { answers: [], cancelled: true }
  }
  const result = record(value)
  if (!result || typeof result.cancelled !== "boolean") {
    throw new TypeError("Invalid ask_user_question dialog result.")
  }
  const rawResponses =
    result.responses === undefined
      ? []
      : Array.isArray(result.responses)
        ? result.responses
        : null
  if (!rawResponses) {
    throw new TypeError("Invalid ask_user_question dialog responses.")
  }
  const answers = rawResponses.map((response) =>
    parseDialogResponse(response, params)
  )
  const seen = new Set<number>()
  for (const answer of answers) {
    if (seen.has(answer.questionIndex)) {
      throw new TypeError(
        "Invalid ask_user_question duplicate dialog response."
      )
    }
    seen.add(answer.questionIndex)
  }
  answers.sort((a, b) => a.questionIndex - b.questionIndex)
  return { answers, cancelled: result.cancelled }
}

export function askUserPromptPayload(
  params: QuestionParams
): AskUserPromptEventPayload {
  return {
    questions: params.questions.map((question) => ({
      question: question.question,
      header: question.header,
      multiSelect: question.multiSelect ?? false,
      options: question.options.map((option) => ({
        label: option.label,
        description: option.description,
        hasPreview:
          typeof option.preview === "string" && option.preview.length > 0,
      })),
    })),
  }
}

function formatAnswerScalar(answer: QuestionAnswer): string {
  if (answer.kind === "multi") {
    return answer.selected && answer.selected.length > 0
      ? answer.selected.join(", ")
      : NO_INPUT_PLACEHOLDER
  }
  if (answer.kind === "custom") {
    return answer.answer && answer.answer.length > 0
      ? answer.answer
      : NO_INPUT_PLACEHOLDER
  }
  return answer.answer ?? NO_INPUT_PLACEHOLDER
}

export function buildAnswerSegment(answer: QuestionAnswer) {
  const parts = [`"${answer.question}"="${formatAnswerScalar(answer)}"`]
  if (answer.preview && answer.preview.length > 0) {
    parts.push(`selected preview: ${answer.preview}`)
  }
  if (answer.notes && answer.notes.length > 0) {
    parts.push(`user notes: ${answer.notes}`)
  }
  return `${parts.join(". ")}.`
}

export function buildToolResult(text: string, details: QuestionnaireResult) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  }
}

export function buildQuestionnaireResponse(
  result: QuestionnaireResult | null | undefined,
  params: QuestionParams
) {
  if (!result || result.cancelled) {
    return buildToolResult(DECLINE_MESSAGE, {
      answers: result?.answers ?? [],
      cancelled: true,
    })
  }
  const segments: string[] = []
  for (let index = 0; index < params.questions.length; index += 1) {
    const answer = result.answers.find(
      (candidate) => candidate.questionIndex === index
    )
    if (answer) segments.push(buildAnswerSegment(answer))
  }
  if (segments.length === 0) {
    return buildToolResult(DECLINE_MESSAGE, {
      answers: result.answers,
      cancelled: true,
    })
  }
  return buildToolResult(
    `${ENVELOPE_PREFIX} ${segments.join(" ")} ${ENVELOPE_SUFFIX}`,
    result
  )
}

export function validationToolResult(
  validation: Exclude<ValidationResult, { ok: true }>
) {
  return buildToolResult(validation.message, {
    answers: [],
    cancelled: true,
    error: validation.error,
  })
}
