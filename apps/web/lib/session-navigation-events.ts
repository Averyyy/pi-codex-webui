export const SESSION_NAVIGATION_INTENT =
  "pi-web-codex:session-navigation-intent"
export const SESSION_ROUTE_REJECTED = "pi-web-codex:session-route-rejected"
export const SESSION_NAVIGATION_CANCELLED =
  "pi-web-codex:session-navigation-cancelled"

export interface SessionRouteRejectedDetail {
  pathname: string
  sessionId: string
  projectId: string | null
}

export interface SessionNavigationCancelledDetail {
  pathname: string
}

export interface SessionNavigationIntentDetail {
  pathname: string
}

export function dispatchSessionNavigationIntent(pathname: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<SessionNavigationIntentDetail>(SESSION_NAVIGATION_INTENT, {
      detail: { pathname },
    })
  )
}

export function dispatchSessionRouteRejected(
  detail: SessionRouteRejectedDetail
) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<SessionRouteRejectedDetail>(SESSION_ROUTE_REJECTED, {
      detail,
    })
  )
}

export function dispatchSessionNavigationCancelled(
  detail?: SessionNavigationCancelledDetail
) {
  if (typeof window === "undefined") return
  if (!detail) {
    window.dispatchEvent(new Event(SESSION_NAVIGATION_CANCELLED))
    return
  }
  window.dispatchEvent(
    new CustomEvent<SessionNavigationCancelledDetail>(
      SESSION_NAVIGATION_CANCELLED,
      { detail }
    )
  )
}
