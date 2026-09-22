"use client"

import {
  AlertCircleIcon,
  DownloadIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
} from "lucide-react"

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import { useI18n } from "@/components/i18n-provider"
import { useAppUpdate } from "@/components/app-update-provider"

export function AppUpdateButton() {
  const { t } = useI18n()
  const { snapshot, operation, checking, error, refresh, startUpdate } =
    useAppUpdate()

  const updateAvailable =
    snapshot?.supported === true &&
    snapshot.available &&
    snapshot.latestVersion !== null
  const updateInProgress =
    operation !== null ||
    snapshot?.phase === "checking" ||
    snapshot?.phase === "installing" ||
    snapshot?.phase === "restarting"
  const updateError =
    snapshot?.phase === "failed" ? (snapshot.error ?? error) : error

  if (snapshot?.supported === false && !updateError) return null

  if (!updateAvailable && !updateInProgress && !updateError) return null

  if (updateInProgress) {
    const label =
      snapshot?.phase === "restarting"
        ? t("appUpdate.restarting")
        : snapshot?.phase === "installing"
          ? t("appUpdate.installing")
          : t("appUpdate.checking")
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          disabled
          tooltip={label}
          aria-busy="true"
        >
          <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  if (updateError) {
    const label = t("appUpdate.retry")
    const canRetryUpdate =
      snapshot?.supported === true &&
      snapshot.latestVersion !== null &&
      snapshot.available === true
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          tooltip={updateError}
          title={updateError}
          onClick={() => void (canRetryUpdate ? startUpdate() : refresh())}
          disabled={checking}
        >
          {checking ? (
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          ) : (
            <AlertCircleIcon />
          )}
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  if (!snapshot?.latestVersion) return null
  const targetVersion = snapshot.latestVersion
  const label = t("appUpdate.updateTo", { version: targetVersion })
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        className="bg-blue-600 text-white hover:bg-blue-700 hover:text-white dark:bg-blue-500 dark:hover:bg-blue-600"
        tooltip={label}
        onClick={() => void startUpdate()}
        disabled={checking}
      >
        {checking ? (
          <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
        ) : (
          <DownloadIcon />
        )}
        <span>{checking ? t("appUpdate.checking") : label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppUpdateRetryButton() {
  const { t } = useI18n()
  const { refresh, checking, error } = useAppUpdate()
  if (!error) return null
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs text-destructive underline underline-offset-2"
      onClick={() => void refresh()}
      disabled={checking}
      title={error}
    >
      <RefreshCwIcon className="size-3" />
      {t("appUpdate.retry")}
    </button>
  )
}
