import { ArchivedSessions } from "@/components/archived-sessions"
import { SettingsSection } from "@/components/settings-section"
import { listArchivedSessions } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"

export default async function ArchiveSettingsPage() {
  const sessions = await listArchivedSessions()
  return (
    <SettingsSection
      title="归档"
      description="归档对话不会出现在工作区列表；删除会永久移除对应的 Pi JSONL。"
    >
      <ArchivedSessions initial={sessions} mutationToken={getMutationToken()} />
    </SettingsSection>
  )
}
