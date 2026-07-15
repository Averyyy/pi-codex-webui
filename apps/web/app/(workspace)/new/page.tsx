import { NewConversation } from "@/components/new-conversation"
import { listWorkspaceProjects } from "@/lib/catalog"
import { loadNewConversationModelSettings } from "@/lib/model-settings-data"
import { getMutationToken } from "@/lib/request-security"

export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const [{ projectId }, projects] = await Promise.all([
    searchParams,
    listWorkspaceProjects(),
  ])
  const availableProjects = projects.map(({ id, name, path }) => ({
    id,
    name,
    path,
  }))
  const initialProjectId = availableProjects.some(
    (project) => project.id === projectId
  )
    ? (projectId ?? null)
    : null
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
