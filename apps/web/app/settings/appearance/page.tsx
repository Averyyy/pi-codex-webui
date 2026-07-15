import { AppearanceSettingsForm } from "@/components/settings-form"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { getMutationToken } from "@/lib/request-security"

export default async function AppearanceSettingsPage() {
  const { config, t } = await getLocalizedConfig()

  return (
    <SettingsSection
      title={t("settings.page.appearance.title")}
      description={t("settings.page.appearance.description")}
    >
      <AppearanceSettingsForm
        key={config.appearance.language}
        initial={config}
        mutationToken={getMutationToken()}
      />
    </SettingsSection>
  )
}
