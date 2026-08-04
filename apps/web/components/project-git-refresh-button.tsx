"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useI18n } from "@/components/i18n-provider"

export function ProjectGitRefreshButton() {
  const router = useRouter()
  const { t } = useI18n()
  const [refreshing, startRefresh] = useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-disabled={refreshing}
      aria-busy={refreshing}
      onClick={() => {
        if (!refreshing) startRefresh(() => router.refresh())
      }}
    >
      <RefreshCwIcon
        className={cn(refreshing && "animate-spin motion-reduce:animate-none")}
      />
      {refreshing ? t("project.git.refreshing") : t("project.git.refresh")}
    </Button>
  )
}
