import assert from "node:assert/strict"
import test from "node:test"

import {
  ERROR_DUPLICATE_OPTION_LABEL,
  ERROR_RESERVED_LABEL,
  buildQuestionnaireResponse,
  parseAskUserDialogResult,
  parseQuestionParams,
  validateQuestionnaire,
} from "./contract.js"

function params() {
  return parseQuestionParams({
    questions: [
      {
        question: "Which implementation?",
        header: "Approach",
        options: [
          {
            label: "Native",
            description: "Use the native implementation.",
            preview: "const mode = 'native'",
          },
          {
            label: "Portable",
            description: "Use the portable implementation.",
          },
        ],
      },
      {
        question: "Which checks?",
        header: "Checks",
        multiSelect: true,
        options: [
          { label: "Tests", description: "Run tests." },
          { label: "Types", description: "Run typecheck." },
          { label: "Lint", description: "Run lint." },
        ],
      },
    ],
  })
}

test("validates the complete 2.2.0 parameter limits", () => {
  assert.doesNotThrow(() =>
    parseQuestionParams({
      questions: [
        {
          question: "Question?",
          header: "😀".repeat(16),
          options: [
            { label: "A", description: "A" },
            { label: "B", description: "B" },
          ],
        },
      ],
    })
  )
  assert.throws(
    () =>
      parseQuestionParams({
        questions: [
          {
            question: "Question?",
            header: "😀".repeat(17),
            options: [
              { label: "A", description: "A" },
              { label: "B", description: "B" },
            ],
          },
        ],
      }),
    /maximum length is 16/
  )
  assert.throws(
    () =>
      parseQuestionParams({
        questions: [
          {
            question: "Question?",
            header: "Header",
            options: [
              { label: "x".repeat(61), description: "A" },
              { label: "B", description: "B" },
            ],
          },
        ],
      }),
    /maximum length is 60/
  )
  assert.throws(
    () =>
      parseQuestionParams({
        questions: [
          {
            question: "Question?",
            header: "Header",
            options: Array.from({ length: 5 }, (_, index) => ({
              label: String(index),
              description: String(index),
            })),
          },
        ],
      }),
    /maximum length is 4/
  )

  const tooMany = parseQuestionParams({
    questions: Array.from({ length: 5 }, (_, index) => ({
      question: `Question ${index}?`,
      header: `Q${index}`,
      options: [
        { label: "A", description: "A" },
        { label: "B", description: "B" },
      ],
    })),
  })
  assert.deepEqual(validateQuestionnaire(tooMany), {
    ok: false,
    error: "too_many_questions",
    message: "Error: At most 4 questions are allowed per invocation",
  })

  assert.deepEqual(
    validateQuestionnaire(parseQuestionParams({ questions: [] })),
    {
      ok: false,
      error: "no_questions",
      message: "Error: At least one question is required",
    }
  )
  assert.deepEqual(
    validateQuestionnaire(
      parseQuestionParams({
        questions: [
          {
            question: "Question?",
            header: "Header",
            options: [{ label: "Only", description: "Only option." }],
          },
        ],
      })
    ),
    {
      ok: false,
      error: "empty_options",
      message: "Error: Each question requires at least 2 options",
    }
  )
  assert.deepEqual(
    validateQuestionnaire(
      parseQuestionParams({
        questions: [
          {
            question: "Same question?",
            header: "First",
            options: [
              { label: "A", description: "A" },
              { label: "B", description: "B" },
            ],
          },
          {
            question: "Same question?",
            header: "Second",
            options: [
              { label: "C", description: "C" },
              { label: "D", description: "D" },
            ],
          },
        ],
      })
    ),
    {
      ok: false,
      error: "duplicate_question",
      message: "Error: Question text must be unique within an invocation",
    }
  )
})

test("reserved labels take precedence over duplicate option labels", () => {
  const validation = validateQuestionnaire(
    parseQuestionParams({
      questions: [
        {
          question: "Question?",
          header: "Header",
          options: [
            { label: "Other", description: "A" },
            { label: "Other", description: "B" },
          ],
        },
      ],
    })
  )
  assert.deepEqual(validation, {
    ok: false,
    error: "reserved_label",
    message: ERROR_RESERVED_LABEL,
  })

  const duplicate = validateQuestionnaire(
    parseQuestionParams({
      questions: [
        {
          question: "Question?",
          header: "Header",
          options: [
            { label: "Same", description: "A" },
            { label: "Same", description: "B" },
          ],
        },
      ],
    })
  )
  assert.deepEqual(duplicate, {
    ok: false,
    error: "duplicate_option_label",
    message: ERROR_DUPLICATE_OPTION_LABEL,
  })
})

test("canonicalizes dialog selections against the authored questions", () => {
  const value = params()
  assert.deepEqual(
    parseAskUserDialogResult(
      {
        cancelled: false,
        responses: [
          {
            questionIndex: 1,
            kind: "multi",
            selectedIndices: [2, 0, 2],
            notes: "  exhaustive  ",
          },
          {
            questionIndex: 0,
            kind: "option",
            optionIndex: 0,
          },
        ],
      },
      value
    ),
    {
      answers: [
        {
          questionIndex: 0,
          question: "Which implementation?",
          kind: "option",
          answer: "Native",
          preview: "const mode = 'native'",
        },
        {
          questionIndex: 1,
          question: "Which checks?",
          kind: "multi",
          answer: null,
          selected: ["Tests", "Lint"],
          notes: "exhaustive",
        },
      ],
      cancelled: false,
    }
  )
})

test("preserves custom answers and trims user notes", () => {
  const value = params()
  assert.deepEqual(
    parseAskUserDialogResult(
      {
        cancelled: false,
        responses: [
          {
            questionIndex: 1,
            kind: "custom",
            answer: "Run smoke tests only",
            notes: "  keep it quick  ",
          },
        ],
      },
      value
    ),
    {
      answers: [
        {
          questionIndex: 1,
          question: "Which checks?",
          kind: "custom",
          answer: "Run smoke tests only",
          notes: "keep it quick",
        },
      ],
      cancelled: false,
    }
  )
})

test("builds the exact upstream response envelope and canonical decline", () => {
  const value = params()
  const result = parseAskUserDialogResult(
    {
      cancelled: false,
      responses: [
        {
          questionIndex: 0,
          kind: "option",
          optionIndex: 0,
          notes: "ship it",
        },
        {
          questionIndex: 1,
          kind: "multi",
          selectedIndices: [0, 1],
        },
      ],
    },
    value
  )
  assert.deepEqual(buildQuestionnaireResponse(result, value), {
    content: [
      {
        type: "text",
        text:
          "User has answered your questions: " +
          '"Which implementation?"="Native". ' +
          "selected preview: const mode = 'native'. user notes: ship it. " +
          '"Which checks?"="Tests, Types". ' +
          "You can now continue with the user's answers in mind.",
      },
    ],
    details: result,
  })
  assert.deepEqual(buildQuestionnaireResponse(undefined, value), {
    content: [{ type: "text", text: "User declined to answer questions" }],
    details: { answers: [], cancelled: true },
  })
})
