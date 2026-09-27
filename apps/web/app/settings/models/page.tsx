import { notFound } from "next/navigation"

import { ModelSettingsLoader } from "@/components/model-settings-loader"
import { SettingsSection } from "@/components/settings-section"
import { getSessionRuntimeTarget } from "@/lib/catalog"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { getMutationToken } from "@/lib/request-security"

export default async function ModelSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  const { t } = await getLocalizedConfig()
  const session = sessionId ? await getSessionRuntimeTarget(sessionId) : null
  if (sessionId && !session) notFound()

  return (
    <SettingsSection
      title={t("settings.page.models.title")}
      description={t("settings.page.models.description")}
    >
      <ModelSettingsLoader
        mutationToken={getMutationToken()}
        sessionId={sessionId ?? null}
        projectId={session?.projectId ?? null}
      />
    </SettingsSection>
  )
}
