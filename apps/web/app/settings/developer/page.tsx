import { RuntimeSettingsForm } from "@/components/runtime-settings-form"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { getMutationToken } from "@/lib/request-security"
import { runtimeProfileViews } from "@/lib/runtime-profiles"

export default async function DeveloperSettingsPage() {
  const { config, t } = await getLocalizedConfig()
  return (
    <SettingsSection
      title={t("settings.page.developer.title")}
      description={t("settings.page.developer.description")}
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
