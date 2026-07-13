import { PackageSettings } from "@/components/package-settings"
import { SettingsSection } from "@/components/settings-section"
import { loadResourceSettings } from "@/lib/resource-settings-data"

export default async function PackagesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const data = await loadResourceSettings(projectId)

  return (
    <SettingsSection
      title="Packages"
      description="使用 Pi 的 package manager 安装、更新或移除资源包。"
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
          添加工作区项目后才能管理 Pi packages。
        </p>
      )}
    </SettingsSection>
  )
}
