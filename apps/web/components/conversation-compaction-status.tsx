"use client"

import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react"

import { useI18n } from "@/components/i18n-provider"

export function ConversationCompactionStatus({
  state,
}: {
  state: "running" | "complete"
}) {
  const { t } = useI18n()
  const running = state === "running"

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm"
    >
      {running ? (
        <LoaderCircleIcon className="animate-spin text-muted-foreground" />
      ) : (
        <CheckCircle2Icon className="text-muted-foreground" />
      )}
      <span>
        {running
          ? t("session.compaction.running")
          : t("session.compaction.complete")}
      </span>
    </div>
  )
}
