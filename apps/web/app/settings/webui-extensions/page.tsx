import { notFound } from "next/navigation"

import { SettingsSection } from "@/components/settings-section"
import { WebUiExtensionSettings } from "@/components/webui-extension-settings"
import { getLocalizedConfig } from "@/lib/i18n-server"
import type { SettingsProjectParam } from "@/lib/settings-project-selection"
import { loadWebUiExtensionSettings } from "@/lib/webui-extension-settings-data"

export default async function WebUiExtensionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: SettingsProjectParam }>
}) {
  const { projectId } = await searchParams
  const { t } = await getLocalizedConfig()
  const data = await loadWebUiExtensionSettings(projectId)
  if (!data) notFound()
  return (
    <SettingsSection
      title={t("settings.page.webuiExtensions.title")}
      description={t("settings.page.webuiExtensions.description")}
    >
      <WebUiExtensionSettings
        key={`${data.selectedProjectId ?? "global"}:${data.catalog.revision}`}
        projects={data.projects}
        projectId={data.selectedProjectId}
        sessionIds={data.sessionIds}
        initialCatalog={data.catalog}
        mutationToken={data.mutationToken}
      />
    </SettingsSection>
  )
}
