import { AgentSettingsForm } from "@/components/agent-settings-form"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { getMutationToken } from "@/lib/request-security"

export default async function AgentSettingsPage() {
  const { t } = await getLocalizedConfig()
  return (
    <SettingsSection
      title={t("settings.agent.title")}
      description={t("settings.agent.description")}
    >
      <AgentSettingsForm mutationToken={getMutationToken()} />
    </SettingsSection>
  )
}
