import assert from "node:assert/strict"
import test from "node:test"

import { promptImagesSchema } from "./prompt-images"

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
