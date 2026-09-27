import {
  applySessionEntityUpdate,
  type SessionEntityUpdatedDetail,
} from "@/lib/session-catalog-events"
import type { SessionPage } from "@/lib/session-types"

export interface SessionEntityUpdateOverlay {
  sessionId: string
  revision: number
  title?: { value: string | null; revision: number }
  hasUnreadCompletion?: { value: boolean; revision: number }
}

export function mergeSessionEntityUpdateOverlay(
  previous: SessionEntityUpdateOverlay | undefined,
  detail: SessionEntityUpdatedDetail,
  revision: number
): SessionEntityUpdateOverlay {
  return {
    sessionId: detail.sessionId,
    revision,
    ...(previous?.title ? { title: previous.title } : {}),
    ...(previous?.hasUnreadCompletion
      ? { hasUnreadCompletion: previous.hasUnreadCompletion }
      : {}),
    ...(detail.title !== undefined
      ? { title: { value: detail.title, revision } }
      : {}),
    ...(detail.hasUnreadCompletion !== undefined
      ? { hasUnreadCompletion: { value: detail.hasUnreadCompletion, revision } }
      : {}),
  }
}

export function sessionPageQueryIdentity(
  scope: "tasks" | "pinned" | "project",
  projectId: string | undefined,
  sidebar: boolean,
  revision: string,
  mutationRevision: number
) {
  return JSON.stringify([
    scope,
    projectId ?? null,
    sidebar,
    revision,
    mutationRevision,
  ])
}

export function appendSessionPage(
  current: SessionPage,
  incoming: SessionPage
): SessionPage {
  const sessions = new Map(
    current.sessions.map((session) => [session.id, session])
  )
  for (const session of incoming.sessions) sessions.set(session.id, session)
  return { sessions: [...sessions.values()], nextCursor: incoming.nextCursor }
}

export function applyPendingSessionEntityUpdates(
  page: SessionPage,
  updates: Map<string, SessionEntityUpdateOverlay>,
  requestRevision: number
) {
  let next = page
  for (const [sessionId, update] of updates) {
    const detail: SessionEntityUpdatedDetail = { sessionId }
    if (update.title && update.title.revision > requestRevision) {
      detail.title = update.title.value
    }
    if (
      update.hasUnreadCompletion &&
      update.hasUnreadCompletion.revision > requestRevision
    ) {
      detail.hasUnreadCompletion = update.hasUnreadCompletion.value
    }
    if (
      detail.title !== undefined ||
      detail.hasUnreadCompletion !== undefined
    ) {
      next = applySessionEntityUpdate(next, detail)
    }
  }
  return next
}

export function clearConfirmedSessionEntityUpdates(
  updates: Map<string, SessionEntityUpdateOverlay>,
  captured: ReadonlyMap<string, SessionEntityUpdateOverlay>,
  confirmedSessionIds: readonly string[]
) {
  for (const sessionId of confirmedSessionIds) {
    const capturedUpdate = captured.get(sessionId)
    const currentUpdate = updates.get(sessionId)
    if (!capturedUpdate || !currentUpdate) continue

    const title =
      capturedUpdate.title &&
      currentUpdate.title?.revision === capturedUpdate.title.revision
        ? undefined
        : currentUpdate.title
    const hasUnreadCompletion =
      capturedUpdate.hasUnreadCompletion &&
      currentUpdate.hasUnreadCompletion?.revision ===
        capturedUpdate.hasUnreadCompletion.revision
        ? undefined
        : currentUpdate.hasUnreadCompletion
    if (!title && !hasUnreadCompletion) {
      updates.delete(sessionId)
    } else {
      updates.set(sessionId, {
        sessionId,
        revision: currentUpdate.revision,
        ...(title ? { title } : {}),
        ...(hasUnreadCompletion ? { hasUnreadCompletion } : {}),
      })
    }
  }
}
