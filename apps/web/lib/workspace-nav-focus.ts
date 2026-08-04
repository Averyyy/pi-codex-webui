import { nextArchiveFocusTarget } from "@/lib/archive-focus"

export type WorkspaceSessionMutationFocusRequest =
  | {
      kind: "pin"
      sessionId: string
      pinned: boolean
      projectId: string | null
    }
  | {
      kind: "archive"
      sessionId: string
      href: string
      navigateHome: boolean
    }

export type WorkspaceNavFocusTarget =
  | Extract<WorkspaceSessionMutationFocusRequest, { kind: "pin" }>
  | { kind: "session"; href: string; archivedSessionId: string }
  | { kind: "new"; archivedSessionId: string }

export interface WorkspaceNavVisibilityTarget {
  getClientRects(): { readonly length: number }
}

export function isWorkspaceNavItemVisible(
  target: WorkspaceNavVisibilityTarget
) {
  return target.getClientRects().length > 0
}

export function workspaceNavFocusTarget(
  request: WorkspaceSessionMutationFocusRequest,
  visibleConversationHrefs: readonly string[]
): WorkspaceNavFocusTarget {
  if (request.kind === "pin") return request
  if (request.navigateHome) {
    return { kind: "new", archivedSessionId: request.sessionId }
  }

  const href = nextArchiveFocusTarget(visibleConversationHrefs, request.href)
  return href === null
    ? { kind: "new", archivedSessionId: request.sessionId }
    : { kind: "session", href, archivedSessionId: request.sessionId }
}
