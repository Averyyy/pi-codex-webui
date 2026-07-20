import assert from "node:assert/strict"
import test from "node:test"

import {
  MAX_PROMPT_IMAGE_BASE64_LENGTH,
  promptImageBase64Length,
  promptImagesSchema,
} from "./prompt-images"

const image = {
  type: "image" as const,
  data: "aGVsbG8=",
  mimeType: "image/png",
}

test("prompt images default to an empty list", () => {
  assert.deepEqual(promptImagesSchema.parse(undefined), [])
})

test("prompt images accept at most ten image payloads", () => {
  assert.equal(
    promptImagesSchema.safeParse(Array(10).fill(image)).success,
    true
  )
  assert.equal(
    promptImagesSchema.safeParse(Array(11).fill(image)).success,
    false
  )
})

test("prompt images reject non-image media types", () => {
  assert.equal(
    promptImagesSchema.safeParse([{ ...image, mimeType: "text/plain" }])
      .success,
    false
  )
})

test("computes the encoded length before reading image bytes", () => {
  assert.equal(promptImageBase64Length(0), 0)
  assert.equal(promptImageBase64Length(1), 4)
  assert.equal(promptImageBase64Length(3), 4)
  assert.equal(promptImageBase64Length(4), 8)
  assert.equal(
    promptImageBase64Length(15_000_000),
    MAX_PROMPT_IMAGE_BASE64_LENGTH
  )
  assert.equal(
    promptImageBase64Length(15_000_001) > MAX_PROMPT_IMAGE_BASE64_LENGTH,
    true
  )
})
