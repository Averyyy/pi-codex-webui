import { z } from "zod"

import { getSessionSnapshot } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"
import { getShellSupervisor } from "@/lib/shell-supervisor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const terminalActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    columns: z.number().int().min(2).max(500),
    rows: z.number().int().min(1).max(300),
  }),
  z.object({
    action: z.literal("input"),
    data: z.string().max(65_536),
  }),
  z.object({
    action: z.literal("resize"),
    columns: z.number().int().min(2).max(500),
    rows: z.number().int().min(1).max(300),
  }),
])

async function requireSession(sessionId: string) {
  const snapshot = await getSessionSnapshot(sessionId)
  if (!snapshot) return null
  return snapshot.session
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/terminal">
) {
  const { sessionId } = await context.params
  if (!(await requireSession(sessionId))) {
    return Response.json({ error: "Session not found." }, { status: 404 })
  }
  const stream = getShellSupervisor().stream(sessionId, request.signal)
  if (!stream) {
    return Response.json(
      { error: "Shell terminal is not running." },
      { status: 409 }
    )
  }
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  })
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/terminal">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const parsed = terminalActionSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid terminal action." },
        { status: 400 }
      )
    }
    const { sessionId } = await context.params
    const session = await requireSession(sessionId)
    if (!session) {
      return Response.json({ error: "Session not found." }, { status: 404 })
    }

    const supervisor = getShellSupervisor()
    if (parsed.data.action === "start") {
      supervisor.start(
        sessionId,
        session.cwd,
        parsed.data.columns,
        parsed.data.rows
      )
    } else if (parsed.data.action === "input") {
      supervisor.input(sessionId, parsed.data.data)
    } else {
      supervisor.resize(sessionId, parsed.data.columns, parsed.data.rows)
    }
    return Response.json({ ok: true })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/sessions/[sessionId]/terminal">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const { sessionId } = await context.params
  return Response.json({ stopped: getShellSupervisor().stop(sessionId) })
}
