import { SettingsSection } from "@/components/settings-section"
import { WebUiExtensionSettings } from "@/components/webui-extension-settings"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { loadWebUiExtensionSettings } from "@/lib/webui-extension-settings-data"

export default async function WebUiExtensionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const { t } = await getLocalizedConfig()
  const data = await loadWebUiExtensionSettings(projectId)
  return (
    <SettingsSection
      title={t("settings.page.webuiExtensions.title")}
      description={t("settings.page.webuiExtensions.description")}
    >
      <WebUiExtensionSettings
        projects={data.projects}
        projectId={data.selectedProjectId}
        initialCatalog={data.catalog}
        mutationToken={data.mutationToken}
      />
    </SettingsSection>
  )
}
