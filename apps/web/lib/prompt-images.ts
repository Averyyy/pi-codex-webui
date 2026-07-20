import { z } from "zod"

export const MAX_PROMPT_IMAGES = 10
export const MAX_PROMPT_IMAGE_BASE64_LENGTH = 20_000_000

export function promptImageBase64Length(byteLength: number) {
  return 4 * Math.ceil(byteLength / 3)
}

export const promptImageSchema = z.object({
  type: z.literal("image"),
  data: z.string().min(1).max(MAX_PROMPT_IMAGE_BASE64_LENGTH),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
})

export const promptImagesSchema = z
  .array(promptImageSchema)
  .max(MAX_PROMPT_IMAGES)
  .default([])

export type PromptImage = z.infer<typeof promptImageSchema>
