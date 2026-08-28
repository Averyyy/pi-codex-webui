import { notFound } from "next/navigation"

import { ExtensionSettings } from "@/components/extension-settings"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { loadResourceSettings } from "@/lib/resource-settings-data"
import type { SettingsProjectParam } from "@/lib/settings-project-selection"

export default async function ExtensionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: SettingsProjectParam }>
}) {
  const { projectId } = await searchParams
  const { t } = await getLocalizedConfig()
  const data = await loadResourceSettings(projectId)
  if (!data) notFound()

  return (
    <SettingsSection
      title={t("settings.page.extensions.title")}
      description={t("settings.page.extensions.description")}
    >
      {data.catalog && data.selectedProjectId ? (
        <ExtensionSettings
          key={`extension:${data.selectedProjectId}`}
          projects={data.projects}
          projectId={data.selectedProjectId}
          sessionIds={data.sessionIds}
          initialCatalog={data.catalog}
          mutationToken={data.mutationToken}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {t("settings.page.noProject.extensions")}
        </p>
      )}
    </SettingsSection>
  )
}
