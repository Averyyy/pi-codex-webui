import { z } from "zod"

export const promptImageSchema = z.object({
  type: z.literal("image"),
  data: z.string().min(1).max(20_000_000),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
})

export const promptImagesSchema = z.array(promptImageSchema).max(10).default([])

export type PromptImage = z.infer<typeof promptImageSchema>
