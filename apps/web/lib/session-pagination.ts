import "server-only"

import { z } from "zod"

export const SESSION_PAGE_SIZE = 40

const querySchema = z
  .object({
    scope: z.enum(["tasks", "pinned", "project"]),
    projectId: z.string().min(1).max(200).optional(),
    order: z.enum(["default", "sidebar"]).default("default"),
    limit: z.coerce.number().int().min(1).max(100).default(SESSION_PAGE_SIZE),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .superRefine((query, context) => {
    if ((query.scope === "project") !== Boolean(query.projectId)) {
      context.addIssue({
        code: "custom",
        message: "Only a project list requires projectId.",
      })
    }
  })

const cursorSchema = z
  .object({
    scope: z.enum(["tasks", "pinned", "project"]),
    projectId: z.string().nullable(),
    order: z.enum(["default", "sidebar"]).default("default"),
    position: z.number().int().nonnegative().nullable().default(null),
    pinnedAt: z.string(),
    updatedAt: z.string().min(1),
    id: z.string().min(1),
  })
  .strict()

export type SessionPageQuery = z.input<typeof querySchema>

export function parseSessionPageQuery(input: SessionPageQuery) {
  const query = querySchema.parse(input)
  if (!query.cursor) return { ...query, after: null }
  if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) {
    throw new Error("Invalid session cursor.")
  }
  const after = cursorSchema.parse(
    JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))
  )
  if (
    after.scope !== query.scope ||
    after.projectId !== (query.projectId ?? null) ||
    after.order !== query.order
  ) {
    throw new Error("Session cursor belongs to a different list.")
  }
  return { ...query, after }
}

export function sessionPageCursor(value: z.infer<typeof cursorSchema>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}
