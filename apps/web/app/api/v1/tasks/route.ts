import { z } from "zod"
import { thinkingLevelSchema } from "@workspace/runtime-protocol"

import { listSessionPage } from "@/lib/catalog"
import {
  parseSessionPageQuery,
  type SessionPageQuery,
} from "@/lib/session-pagination"
import { promptImagesSchema } from "@/lib/prompt-images"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSchema = z.object({
  runtimeProfileId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(100_000).optional(),
  images: promptImagesSchema,
  thinkingLevel: thinkingLevelSchema.optional(),
  model: z
    .object({
      provider: z.string().min(1),
      modelId: z.string().min(1),
    })
    .optional(),
})

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  let query: SessionPageQuery
  try {
    query = parseSessionPageQuery({
      scope: "tasks",
      cursor: params.get("cursor") ?? undefined,
      limit: params.get("limit") ?? undefined,
    })
  } catch {
    return Response.json(
      { error: "Invalid session pagination parameters." },
      { status: 400 }
    )
  }
  const page = await listSessionPage(query)
  return Response.json(
    { tasks: page.sessions, nextCursor: page.nextCursor },
    { headers: { "Cache-Control": "no-store" } }
  )
}

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const text = await request.text()
    const parsed = createSchema.safeParse(text ? JSON.parse(text) : {})
    if (!parsed.success) {
      return Response.json({ error: "Invalid task input." }, { status: 400 })
    }
    return Response.json(
      await getRuntimeSupervisor().createTask({
        runtimeProfileId: parsed.data.runtimeProfileId,
        initialMessage: parsed.data.message,
        initialImages: parsed.data.images,
        model: parsed.data.model,
        thinkingLevel: parsed.data.thinkingLevel,
      }),
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    )
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      )
    }
    return runtimeErrorResponse(error)
  }
}
