import { AppearanceSettingsForm } from "@/components/settings-form"
import { SettingsSection } from "@/components/settings-section"
import { loadConfig } from "@/lib/config"
import { getMutationToken } from "@/lib/request-security"

export default async function AppearanceSettingsPage() {
  return (
    <SettingsSection title="外观" description="调整真实应用壳的主题与尺寸。">
      <AppearanceSettingsForm
        initial={await loadConfig()}
        mutationToken={getMutationToken()}
      />
    </SettingsSection>
  )
}
