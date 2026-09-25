"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useI18n } from "@/components/i18n-provider"

export function SessionRefreshButton({
  sessionId,
  mutationToken,
}: {
  sessionId: string
  mutationToken: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const response = await fetch(
        `/api/v1/refresh?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
        }
      )
      if (!response.ok) throw new Error(`Refresh failed (${response.status}).`)
      router.refresh()
    } catch (failure) {
      console.error("Could not refresh session data:", failure)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("session.refresh")}
          aria-busy={refreshing}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCwIcon className={refreshing ? "animate-spin" : undefined} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t("session.refresh")}</TooltipContent>
    </Tooltip>
  )
}
