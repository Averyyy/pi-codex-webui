import { z } from "zod"

import { reorderWorkspaceNav, WorkspaceNavOrderError } from "@/lib/catalog"
import { validateLocalMutation } from "@/lib/request-security"
import { readJsonBody, runtimeErrorResponse } from "@/lib/runtime-api"

export const runtime = "nodejs"

const orderSchema = z
  .object({
    scope: z.enum(["projects", "tasks", "pinned", "project"]),
    projectId: z.string().trim().min(1).max(200).optional(),
    itemId: z.string().trim().min(1).max(200),
    targetId: z.string().trim().min(1).max(200),
    position: z.enum(["before", "after"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === "project" && !value.projectId) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "projectId is required for project ordering.",
      })
    }
    if (value.scope !== "project" && value.projectId) {
      context.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "projectId is only valid for project ordering.",
      })
    }
  })

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const parsed = orderSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid sidebar order input." },
        { status: 400 }
      )
    }
    await reorderWorkspaceNav(parsed.data)
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof WorkspaceNavOrderError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return runtimeErrorResponse(error)
  }
}
