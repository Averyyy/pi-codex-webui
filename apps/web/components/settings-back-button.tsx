"use client"

import { useRouter } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { useI18n } from "@/components/i18n-provider"

export function SettingsBackButton() {
  const router = useRouter()
  const { t } = useI18n()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t("settings.back")}
      title={t("settings.back")}
      onClick={() => router.back()}
    >
      <ArrowLeftIcon />
    </Button>
  )
}
