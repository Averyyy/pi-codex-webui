import { GeneralSettingsForm } from "@/components/settings-form"
import { NotificationSettings } from "@/components/notification-settings"
import { SettingsSection } from "@/components/settings-section"
import { loadConfig } from "@/lib/config"
import { getMutationToken } from "@/lib/request-security"

export default async function GeneralSettingsPage() {
  return (
    <SettingsSection title="常规" description="配置本地 Web Host 的启动行为。">
      <GeneralSettingsForm
        initial={await loadConfig()}
        mutationToken={getMutationToken()}
      />
      <NotificationSettings />
    </SettingsSection>
  )
}
