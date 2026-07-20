import { GeneralSettingsForm } from "@/components/settings-form"
import { NotificationSettings } from "@/components/notification-settings"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { getMutationToken } from "@/lib/request-security"

export default async function GeneralSettingsPage() {
  const { config, t } = await getLocalizedConfig()

  return (
    <SettingsSection
      title={t("settings.page.general.title")}
      description={t("settings.page.general.description")}
    >
      <GeneralSettingsForm
        key={config.revision}
        initial={config}
        mutationToken={getMutationToken()}
      />
      <NotificationSettings />
    </SettingsSection>
  )
}
