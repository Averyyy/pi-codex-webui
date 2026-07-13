import { RuntimeSettingsForm } from "@/components/runtime-settings-form"
import { SettingsSection } from "@/components/settings-section"
import { loadConfig } from "@/lib/config"
import { getMutationToken } from "@/lib/request-security"
import { runtimeProfileViews } from "@/lib/runtime-profiles"

export default async function DeveloperSettingsPage() {
  const config = await loadConfig()
  return (
    <SettingsSection
      title="Developer"
      description="配置新 session 使用的 Agent runtime 与 Pi Server 连接。"
    >
      <RuntimeSettingsForm
        initial={{
          revision: config.revision,
          defaultProfileId: config.developer.runtime.default,
          profiles: runtimeProfileViews(config),
        }}
        mutationToken={getMutationToken()}
      />
    </SettingsSection>
  )
}
