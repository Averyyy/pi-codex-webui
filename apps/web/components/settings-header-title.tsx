"use client"

import { useI18n } from "@/components/i18n-provider"

export function SettingsHeaderTitle() {
  const { t } = useI18n()
  return <span className="font-medium">{t("settings.label")}</span>
}
