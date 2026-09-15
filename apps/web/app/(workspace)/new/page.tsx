import { redirect } from "next/navigation"

import { NewConversationLoader } from "@/components/new-conversation-loader"
import { listWorkspaceProjectChoices } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { resolveNewConversationProjectQuery } from "@/lib/workspace-route-query"

export default async function NewConversationPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>
}) {
  const [{ projectId: projectIdQuery }, projects] = await Promise.all([
    searchParams,
    listWorkspaceProjectChoices(),
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

  return (
    <NewConversationLoader
      projects={availableProjects}
      initialProjectId={initialProjectId}
      mutationToken={getMutationToken()}
    />
  )
}
