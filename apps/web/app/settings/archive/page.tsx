import { ArchivedSessions } from "@/components/archived-sessions"
import { SettingsSection } from "@/components/settings-section"
import { listArchivedSessions } from "@/lib/catalog"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { getMutationToken } from "@/lib/request-security"

export default async function ArchiveSettingsPage() {
  const [{ t }, sessions] = await Promise.all([
    getLocalizedConfig(),
    listArchivedSessions(),
  ])
  return (
    <SettingsSection
      title={t("settings.page.archive.title")}
      description={t("settings.page.archive.description")}
    >
      <ArchivedSessions initial={sessions} mutationToken={getMutationToken()} />
    </SettingsSection>
  )
}
