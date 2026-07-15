import { McpSettings } from "@/components/mcp-settings"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { loadMcpSettings } from "@/lib/mcp-settings-data"

export default async function McpSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const { t } = await getLocalizedConfig()
  const data = await loadMcpSettings(projectId)

  return (
    <SettingsSection
      title={t("settings.page.mcp.title")}
      description={t("settings.page.mcp.description")}
    >
      <McpSettings
        key={data.catalog.projectId ?? "global"}
        projects={data.projects}
        initialCatalog={data.catalog}
        mutationToken={data.mutationToken}
      />
    </SettingsSection>
  )
}
