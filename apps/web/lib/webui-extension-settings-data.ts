import "server-only"

import { listWorkspaceProjects } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry"

export async function loadWebUiExtensionSettings(projectId?: string) {
  const projects = await listWorkspaceProjects()
  const selected =
    projects.find((project) => project.id === projectId) ?? projects[0] ?? null
  if (!selected) {
    const catalog = await webUiExtensionCatalog()
    return {
      projects: [],
      selectedProjectId: null,
      catalog,
      mutationToken: getMutationToken(),
    }
  }
  const supervisor = getRuntimeSupervisor()
  const resources = await supervisor.resourceCatalog(selected.path)
  const sessionIds = selected.sessions.map((session) => session.id)
  const catalog = await webUiExtensionCatalog({
    cwd: selected.path,
    projectId: selected.id,
    projectTrusted: resources.projectTrusted,
  })
  catalog.statuses = supervisor.webUiExtensionStatuses(sessionIds)
  return {
    projects: projects.map(({ id, name, path }) => ({ id, name, path })),
    selectedProjectId: selected.id,
    catalog,
    mutationToken: getMutationToken(),
  }
}
