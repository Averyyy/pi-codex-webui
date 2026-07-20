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

export async function showBrowserNotification(title: string, body: string) {
  const options: NotificationOptions = { body, icon: "/pwa-icon.svg" }
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration) {
      await registration.showNotification(title, options)
      return
    }
  }
  new Notification(title, options)
}

export function notifyWhenHidden(title: string, body: string) {
  if (!document.hidden || !browserNotificationsEnabled()) return
  void showBrowserNotification(title, body).catch((error: unknown) => {
    console.error("Could not show browser notification:", error)
  })
}
