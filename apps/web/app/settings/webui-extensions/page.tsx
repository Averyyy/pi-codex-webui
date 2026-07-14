import { SettingsSection } from "@/components/settings-section"
import { WebUiExtensionSettings } from "@/components/webui-extension-settings"
import { loadWebUiExtensionSettings } from "@/lib/webui-extension-settings-data"

export default async function WebUiExtensionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const data = await loadWebUiExtensionSettings(projectId)
  return (
    <SettingsSection
      title="WebUI Extensions"
      description="Manage native Web adapters and their permanent Pi TUI fallback."
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
