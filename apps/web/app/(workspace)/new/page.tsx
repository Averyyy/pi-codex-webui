import { NewConversation } from "@/components/new-conversation"
import { listWorkspaceProjects } from "@/lib/catalog"
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

  return (
    <NewConversation
      projects={availableProjects}
      initialProjectId={
        availableProjects.some((project) => project.id === projectId)
          ? (projectId ?? null)
          : null
      }
      mutationToken={getMutationToken()}
    />
  )
}
