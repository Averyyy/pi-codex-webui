import { extensionUIResponseSchema } from "@workspace/runtime-protocol"
import { z } from "zod"

import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export const runtime = "nodejs"

const responseSchema = z.object({
  sessionId: z.string().min(1),
  response: extensionUIResponseSchema,
})

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/extension-ui/[requestId]/respond">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  try {
    const parsed = responseSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid extension UI response." },
        { status: 400 }
      )
    }
    const { requestId } = await context.params
    await getRuntimeSupervisor().respondToExtensionUI(
      parsed.data.sessionId,
      requestId,
      parsed.data.response
    )
    return new Response(null, { status: 204 })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}
