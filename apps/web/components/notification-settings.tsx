"use client"

import { useState, useSyncExternalStore } from "react"
import { BellIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Switch } from "@workspace/ui/components/switch"

import { useI18n } from "@/components/i18n-provider"
import {
  BROWSER_NOTIFICATIONS_KEY,
  showBrowserNotification,
} from "@/lib/browser-notifications"

type PermissionState = NotificationPermission | "unsupported"
const NOTIFICATION_SETTINGS_EVENT = "pi-web-codex:notification-settings"

function notificationSnapshot() {
  if (!("Notification" in window)) return "unsupported:0"
  const enabled =
    Notification.permission === "granted" &&
    window.localStorage.getItem(BROWSER_NOTIFICATIONS_KEY) === "1"
  return `${Notification.permission}:${enabled ? "1" : "0"}`
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener)
  window.addEventListener(NOTIFICATION_SETTINGS_EVENT, listener)
  return () => {
    window.removeEventListener("storage", listener)
    window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, listener)
  }
}

export function NotificationSettings() {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const snapshot = useSyncExternalStore(
    subscribe,
    notificationSnapshot,
    () => "unsupported:0"
  )
  const [permissionValue, enabledValue] = snapshot.split(":")
  const permission = permissionValue as PermissionState
  const enabled = enabledValue === "1"

  function settingsChanged() {
    window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_EVENT))
  }

  async function setNotifications(next: boolean) {
    if (pending) return
    setPending(true)
    try {
      if (!next) {
        window.localStorage.removeItem(BROWSER_NOTIFICATIONS_KEY)
        settingsChanged()
        return
      }
      const nextPermission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission
      if (nextPermission !== "granted") {
        settingsChanged()
        toast.error(t("settings.notifications.permissionDenied"))
        return
      }
      window.localStorage.setItem(BROWSER_NOTIFICATIONS_KEY, "1")
      settingsChanged()
      await showBrowserNotification(
        "pi-web-codex",
        t("settings.notifications.testBody")
      )
    } catch {
      window.localStorage.removeItem(BROWSER_NOTIFICATIONS_KEY)
      settingsChanged()
      toast.error(t("settings.notifications.showFailed"))
    } finally {
      setPending(false)
    }
  }

  const description =
    permission === "unsupported"
      ? t("settings.notifications.unsupported")
      : permission === "denied"
        ? t("settings.notifications.denied")
        : t("settings.notifications.enabledDescription")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-4" /> {t("settings.notifications.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.notifications.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>
                {t("settings.notifications.agentComplete")}
              </FieldTitle>
              <FieldDescription>{description}</FieldDescription>
            </FieldContent>
            <Switch
              checked={enabled}
              onCheckedChange={(next) => void setNotifications(next)}
              disabled={
                pending ||
                permission === "unsupported" ||
                permission === "denied"
              }
              aria-label={t("settings.notifications.agentComplete")}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
