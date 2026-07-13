import { ResourceListSettings } from "@/components/resource-list-settings"
import { SettingsSection } from "@/components/settings-section"
import { loadResourceSettings } from "@/lib/resource-settings-data"

export default async function ExtensionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const data = await loadResourceSettings(projectId)

  return (
    <SettingsSection
      title="Extensions"
      description="查看并切换 Pi 实际解析到的全局与项目扩展。"
    >
      {data.catalog && data.selectedProjectId ? (
        <ResourceListSettings
          kind="extension"
          projects={data.projects}
          projectId={data.selectedProjectId}
          sessionIds={data.sessionIds}
          initialCatalog={data.catalog}
          mutationToken={data.mutationToken}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          添加工作区项目后才能管理 Pi extensions。
        </p>
      )}
    </SettingsSection>
  )
}
