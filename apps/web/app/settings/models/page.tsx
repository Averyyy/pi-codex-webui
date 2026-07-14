import { notFound } from "next/navigation"

import { ModelSettings } from "@/components/model-settings"
import { SettingsSection } from "@/components/settings-section"
import { loadModelSettings } from "@/lib/model-settings-data"

export default async function ModelSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>
}) {
  const { sessionId } = await searchParams
  const data = await loadModelSettings(sessionId)
  if (!data) notFound()

  return (
    <SettingsSection
      title="模型"
      description="管理 Pi 的 provider 认证与可用 Model scope。"
    >
      <ModelSettings
        initial={data.settings}
        mutationToken={data.mutationToken}
        sessionId={data.sessionId}
      />
    </SettingsSection>
  )
}
