"use client"

import { useI18n } from "@/components/i18n-provider"

export default function WorkspaceLoading() {
  const { t } = useI18n()
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-14"
      role="status"
      aria-busy="true"
    >
      <p className="text-sm text-muted-foreground">
        {t("session.list.loading")}
      </p>
      <div className="h-9 w-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="h-32 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
    </div>
  )
}
