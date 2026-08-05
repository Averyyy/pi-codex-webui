import { KeyboardShortcutSettings } from "@/components/keyboard-shortcut-settings"
import { SettingsSection } from "@/components/settings-section"
import { getLocalizedConfig } from "@/lib/i18n-server"

export default async function KeyboardShortcutsPage() {
  const { t } = await getLocalizedConfig()

  return (
    <SettingsSection
      title={t("settings.page.shortcuts.title")}
      description={t("settings.page.shortcuts.description")}
    >
      <KeyboardShortcutSettings />
    </SettingsSection>
  )
}
