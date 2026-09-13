import { z } from "zod"
import {
  decodeTranscriptCursor,
  getSessionTranscriptPage,
} from "@/lib/session-transcript"
import { runtimeErrorResponse } from "@/lib/runtime-api"

export const runtime = "nodejs"

const querySchema = z
  .object({
    cursor: z.string().max(4096).optional(),
    entryId: z.string().min(1).max(1024).optional(),
    focusId: z.string().min(1).max(1024).optional(),
  })
  .strict()
  .refine((value) => !(value.entryId && value.focusId))

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params
  let query: z.infer<typeof querySchema>
  try {
    query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    )
    if (query.cursor) decodeTranscriptCursor(query.cursor, sessionId)
  } catch {
    return Response.json(
      { error: "Invalid history pagination parameters." },
      { status: 400 }
    )
  }
  try {
    const page = await getSessionTranscriptPage(sessionId, {
      ...query,
      sync: !query.cursor,
    })
    return page
      ? Response.json(page, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "Session not found." }, { status: 404 })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
