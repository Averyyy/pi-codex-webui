import { redirect } from "next/navigation"

import { NewConversation } from "@/components/new-conversation"
import { listWorkspaceProjects } from "@/lib/catalog"
import { loadNewConversationModelSettings } from "@/lib/model-settings-data"
import { getMutationToken } from "@/lib/request-security"
import { resolveNewConversationProjectQuery } from "@/lib/workspace-route-query"

export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>
}) {
  const [{ projectId: projectIdQuery }, projects] = await Promise.all([
    searchParams,
    listWorkspaceProjects(),
  ])
  const availableProjects = projects.map(({ id, name, path }) => ({
    id,
    name,
    path,
  }))
  const { value: initialProjectId, canonicalHref } =
    resolveNewConversationProjectQuery(
      projectIdQuery,
      new Set(availableProjects.map((project) => project.id))
    )
  if (canonicalHref) redirect(canonicalHref)

  const initialModelSettings =
    await loadNewConversationModelSettings(initialProjectId)
  if (!initialModelSettings) {
    throw new Error("Unable to load model settings for a new conversation.")
  }

  return (
    <NewConversation
      projects={availableProjects}
      initialProjectId={initialProjectId}
      initialModelSettings={initialModelSettings}
      mutationToken={getMutationToken()}
    />
  )
}
