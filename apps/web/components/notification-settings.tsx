"use client"

import { useSyncExternalStore } from "react"
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

import { BROWSER_NOTIFICATIONS_KEY } from "@/lib/browser-notifications"

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
      toast.error("浏览器没有授予通知权限。")
      return
    }
    window.localStorage.setItem(BROWSER_NOTIFICATIONS_KEY, "1")
    settingsChanged()
    new Notification("pi-web-codex", {
      body: "桌面通知已启用。",
      icon: "/pwa-icon.svg",
    })
  }

  const description =
    permission === "unsupported"
      ? "当前浏览器不支持系统通知。"
      : permission === "denied"
        ? "权限已被浏览器阻止；请在站点设置中重新授权。"
        : "页面位于后台时，在 Agent 完成或 Runtime 崩溃后发送系统通知。"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-4" /> 浏览器通知
        </CardTitle>
        <CardDescription>
          通知权限和开关由当前浏览器保存，不写入项目。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Agent 完成通知</FieldTitle>
              <FieldDescription>{description}</FieldDescription>
            </FieldContent>
            <Switch
              checked={enabled}
              onCheckedChange={(next) => void setNotifications(next)}
              disabled={permission === "unsupported" || permission === "denied"}
              aria-label="Agent 完成通知"
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
