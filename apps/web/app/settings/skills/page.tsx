import { ResourceListSettings } from "@/components/resource-list-settings"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { loadResourceSettings } from "@/lib/resource-settings-data"

export default async function SkillsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const { t } = await getLocalizedConfig()
  const data = await loadResourceSettings(projectId)

  return (
    <SettingsSection
      title={t("settings.page.skills.title")}
      description={t("settings.page.skills.description")}
    >
      {data.catalog && data.selectedProjectId ? (
        <ResourceListSettings
          key={`skill:${data.selectedProjectId}`}
          kind="skill"
          projects={data.projects}
          projectId={data.selectedProjectId}
          sessionIds={data.sessionIds}
          initialCatalog={data.catalog}
          mutationToken={data.mutationToken}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {t("settings.page.noProject.skills")}
        </p>
      )}
    </SettingsSection>
  )
}
