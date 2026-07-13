import { McpSettings } from "@/components/mcp-settings"
import { SettingsSection } from "@/components/settings-section"
import { loadMcpSettings } from "@/lib/mcp-settings-data"

export default async function McpSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const data = await loadMcpSettings(projectId)

  return (
    <SettingsSection
      title="MCP"
      description="配置真实的 stdio / Streamable HTTP server、发现 tools，并控制 runtime 注入。"
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
