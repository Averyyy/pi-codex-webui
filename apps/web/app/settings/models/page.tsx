import { notFound } from "next/navigation"

import { ModelSettings } from "@/components/model-settings"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { loadModelSettings } from "@/lib/model-settings-data"

export default async function ModelSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  const { t } = await getLocalizedConfig()
  const data = await loadModelSettings(sessionId)
  if (!data) notFound()

  return (
    <SettingsSection
      title={t("settings.page.models.title")}
      description={t("settings.page.models.description")}
    >
      <ModelSettings
        initial={data.settings}
        mutationToken={data.mutationToken}
        sessionId={data.sessionId}
      />
    </SettingsSection>
  )
}
