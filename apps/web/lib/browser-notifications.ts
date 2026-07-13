export const BROWSER_NOTIFICATIONS_KEY =
  "pi-web-codex:browser-notifications-enabled"

export function browserNotificationsEnabled() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    window.localStorage.getItem(BROWSER_NOTIFICATIONS_KEY) === "1"
  )
}

export function notifyWhenHidden(title: string, body: string) {
  if (!document.hidden || !browserNotificationsEnabled()) return
  new Notification(title, { body, icon: "/pwa-icon.svg" })
}
