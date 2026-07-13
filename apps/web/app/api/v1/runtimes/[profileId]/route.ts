import { ZodError, z } from "zod"

import { ConfigConflictError, loadConfig, patchConfig } from "@/lib/config"
import { validateLocalMutation } from "@/lib/request-security"
import { normalizeServerUrl, runtimeProfileViews } from "@/lib/runtime-profiles"
import { removeSecret, writeSecret } from "@/lib/secret-store"

export const runtime = "nodejs"

const updateSchema = z
  .object({
    enabled: z.boolean(),
    serverUrl: z.string().max(2_048),
    authToken: z.string().min(1).max(8_192).optional(),
    clearAuthToken: z.boolean().default(false),
    defaultProfileId: z.string().min(1),
  })
  .refine((value) => !(value.authToken && value.clearAuthToken), {
    message: "authToken and clearAuthToken are mutually exclusive.",
  })

function revisionFrom(request: Request) {
  return request.headers.get("if-match")?.match(/^"revision-(\d+)"$/)?.[1]
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/runtimes/[profileId]">
) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }
  const revision = revisionFrom(request)
  if (!revision) {
    return Response.json(
      { error: "A valid If-Match header is required." },
      { status: 428 }
    )
  }

  let createdSecret: string | null = null
  let committed = false
  try {
    const input = updateSchema.parse(await request.json())
    const { profileId } = await context.params
    const current = await loadConfig()
    const profile = current.developer.runtime.profiles[profileId]
    if (!profile) {
      return Response.json(
        { error: "Runtime profile not found." },
        { status: 404 }
      )
    }
    if (profile.kind !== "pi-client") {
      return Response.json(
        { error: "The built-in Pi profile is read-only." },
        { status: 400 }
      )
    }

    if (
      input.defaultProfileId !== "pi" &&
      input.defaultProfileId !== profileId
    ) {
      return Response.json(
        { error: "Invalid default runtime profile." },
        { status: 400 }
      )
    }
    let serverUrl: string
    try {
      serverUrl = normalizeServerUrl(input.serverUrl)
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "Invalid server URL.",
        },
        { status: 400 }
      )
    }
    if (input.enabled && !serverUrl) {
      return Response.json(
        { error: "Server URL is required when Pi Client is enabled." },
        { status: 400 }
      )
    }
    if (input.defaultProfileId === profileId && !input.enabled) {
      return Response.json(
        { error: "The default runtime profile must be enabled." },
        { status: 400 }
      )
    }

    const oldSecret = profile.authTokenRef
    createdSecret = input.authToken ? await writeSecret(input.authToken) : null
    const authTokenRef = input.clearAuthToken
      ? null
      : (createdSecret ?? oldSecret)
    const next = await patchConfig(Number(revision), {
      developer: {
        runtime: {
          default: input.defaultProfileId,
          profiles: {
            ...current.developer.runtime.profiles,
            [profileId]: {
              kind: "pi-client",
              enabled: input.enabled,
              serverUrl,
              authTokenRef,
            },
          },
        },
      },
    })
    committed = true
    if (oldSecret && oldSecret !== authTokenRef) await removeSecret(oldSecret)
    return Response.json(
      {
        revision: next.revision,
        defaultProfileId: next.developer.runtime.default,
        profiles: runtimeProfileViews(next),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          ETag: `"revision-${next.revision}"`,
        },
      }
    )
  } catch (error) {
    if (createdSecret && !committed) await removeSecret(createdSecret)
    if (error instanceof ConfigConflictError) {
      return Response.json(
        { error: error.message, revision: error.currentRevision },
        { status: 409 }
      )
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid runtime settings." },
        { status: 400 }
      )
    }
    throw error
  }
}
