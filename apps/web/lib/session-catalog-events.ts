export const SESSION_CATALOG_CHANGED = "pi-web-codex:session-catalog-changed"
export const SESSION_ENTITY_UPDATED = "pi-web-codex:session-entity-updated"

export interface SessionCatalogChangedDetail {
  scope?: "tasks" | "pinned" | "project"
  projectId?: string
}

export interface SessionEntityUpdatedDetail {
  sessionId: string
  title?: string | null
  hasUnreadCompletion?: boolean
}

export function sessionNameEntityUpdate(
  sessionId: string,
  payload: unknown
): SessionEntityUpdatedDetail {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("type" in payload) ||
    payload.type !== "session_info_changed" ||
    ("name" in payload &&
      payload.name !== undefined &&
      typeof payload.name !== "string")
  ) {
    throw new Error("Invalid Pi session name change event.")
  }
  const name = "name" in payload ? payload.name : undefined
  return {
    sessionId,
    title: typeof name === "string" ? name : null,
  }
}

export interface SessionPageEntityCollection<T extends { id: string }> {
  sessions: T[]
  nextCursor: string | null
}

export function applySessionEntityUpdate<
  T extends {
    id: string
    title?: string | null
    hasUnreadCompletion?: boolean
  },
>(
  page: SessionPageEntityCollection<T>,
  detail: SessionEntityUpdatedDetail
): SessionPageEntityCollection<T> {
  let changed = false
  const sessions = page.sessions.map((session) => {
    if (session.id !== detail.sessionId) return session
    const next = {
      ...session,
      ...(detail.title !== undefined ? { title: detail.title } : {}),
      ...(detail.hasUnreadCompletion !== undefined
        ? { hasUnreadCompletion: detail.hasUnreadCompletion }
        : {}),
    }
    if (
      next.title === session.title &&
      next.hasUnreadCompletion === session.hasUnreadCompletion
    ) {
      return session
    }
    changed = true
    return next
  })
  return changed ? { ...page, sessions } : page
}

export function dispatchSessionEntityUpdated(
  detail: SessionEntityUpdatedDetail
) {
  if (!detail.sessionId) {
    throw new Error("A session entity update requires a session ID.")
  }
  if (detail.title === undefined && detail.hasUnreadCompletion === undefined) {
    throw new Error(
      "A session entity update requires at least one changed field."
    )
  }
  window.dispatchEvent(
    new CustomEvent<SessionEntityUpdatedDetail>(SESSION_ENTITY_UPDATED, {
      detail,
    })
  )
}
