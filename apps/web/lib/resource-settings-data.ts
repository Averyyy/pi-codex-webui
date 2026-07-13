import "server-only"

import { listWorkspaceProjects } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export async function loadResourceSettings(projectId?: string) {
  const projects = await listWorkspaceProjects()
  const selected =
    projects.find((project) => project.id === projectId) ?? projects[0] ?? null
  return {
    projects: projects.map(({ id, name, path }) => ({ id, name, path })),
    selectedProjectId: selected?.id ?? null,
    sessionIds: selected?.sessions.map((session) => session.id) ?? [],
    catalog: selected
      ? await getRuntimeSupervisor().resourceCatalog(selected.path)
      : null,
    mutationToken: getMutationToken(),
  }
}
