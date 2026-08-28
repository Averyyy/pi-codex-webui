import { redirect } from "next/navigation"

export default async function LegacyPiExtensionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  redirect(
    projectId
      ? `/settings/extensions?projectId=${encodeURIComponent(projectId)}`
      : "/settings/extensions"
  )
}
