import { ZodError } from "zod"

import { ConfigConflictError, loadConfig, patchConfig } from "@/lib/config"
import { configPatchSchema } from "@/lib/config-schema"
import { getMutationToken, validateLocalMutation } from "@/lib/request-security"

export const runtime = "nodejs"

function response(config: Awaited<ReturnType<typeof loadConfig>>) {
  return Response.json(config, {
    headers: {
      "Cache-Control": "no-store",
      ETag: `"revision-${config.revision}"`,
      "X-Pi-Web-Codex-Mutation-Token": getMutationToken(),
    },
  })
}

export async function GET() {
  return response(await loadConfig())
}

export async function PATCH(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  const match = request.headers.get("if-match")
  const revision = match?.match(/^"revision-(\d+)"$/)?.[1]
  if (!revision) {
    return Response.json(
      { error: "A valid If-Match header is required." },
      { status: 428 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      )
    }
    throw error
  }

  try {
    return response(
      await patchConfig(Number(revision), configPatchSchema.parse(body))
    )
  } catch (error) {
    if (error instanceof ConfigConflictError) {
      return Response.json(
        { error: error.message, revision: error.currentRevision },
        { status: 409 }
      )
    }
    if (error instanceof ZodError) {
      return Response.json(
        { error: "Invalid settings.", issues: error.issues },
        { status: 400 }
      )
    }
    throw error
  }
}
