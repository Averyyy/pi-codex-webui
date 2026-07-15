import { PackageSettings } from "@/components/package-settings"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { loadResourceSettings } from "@/lib/resource-settings-data"

export default async function PackagesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const { t } = await getLocalizedConfig()
  const data = await loadResourceSettings(projectId)

  return (
    <SettingsSection
      title={t("settings.page.packages.title")}
      description={t("settings.page.packages.description")}
    >
      {data.catalog && data.selectedProjectId ? (
        <PackageSettings
          projects={data.projects}
          projectId={data.selectedProjectId}
          sessionIds={data.sessionIds}
          initialCatalog={data.catalog}
          mutationToken={data.mutationToken}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {t("settings.page.noProject.packages")}
        </p>
      )}
    </SettingsSection>
  )
}
