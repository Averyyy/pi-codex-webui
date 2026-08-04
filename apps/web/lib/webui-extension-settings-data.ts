import "server-only"

import {
  getProject,
  listProjectSessions,
  listWorkspaceProjects,
} from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { RuntimeRequestError } from "@/lib/runtime-error"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry"

export async function loadWebUiExtensionCatalog(projectId: string | null) {
  if (!projectId) {
    return {
      selectedProjectId: null,
      sessionIds: [],
      catalog: await webUiExtensionCatalog({
        projectId: null,
        projectTrusted: false,
      }),
    }
  }
  const selected = await getProject(projectId)
  if (!selected) {
    throw new RuntimeRequestError("ProjectNotFound", "Project not found.")
  }
  const supervisor = getRuntimeSupervisor()
  const resources = await supervisor.resourceCatalog(selected.path)
  const sessionIds = (await listProjectSessions(selected.id)).map(
    (session) => session.id
  )
  const catalog = await webUiExtensionCatalog({
    cwd: selected.path,
    projectId: selected.id,
    projectTrusted: resources.projectTrusted,
  })
  catalog.statuses = supervisor.webUiExtensionStatuses(sessionIds)
  return {
    selectedProjectId: selected.id,
    sessionIds,
    catalog,
  }
}

export async function loadWebUiExtensionSettings(projectId?: string) {
  const projects = await listWorkspaceProjects()
  const selected =
    projects.find((project) => project.id === projectId) ?? projects[0] ?? null
  const context = await loadWebUiExtensionCatalog(selected?.id ?? null)
  return {
    projects: projects.map(({ id, name, path }) => ({ id, name, path })),
    ...context,
    mutationToken: getMutationToken(),
  }
}
