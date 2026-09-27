import "server-only"

import { getProject, listWorkspaceProjects } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { RuntimeRequestError } from "@/lib/runtime-error"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import {
  selectSettingsProject,
  type SettingsProjectParam,
} from "@/lib/settings-project-selection"
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry"

export async function loadWebUiExtensionCatalog(
  projectId: string | null,
  options: { refresh?: boolean } = {}
) {
  if (!projectId) {
    return {
      selectedProjectId: null,
      sessionIds: [],
      catalog: await webUiExtensionCatalog(
        {
          projectId: null,
          projectTrusted: false,
        },
        options
      ),
    }
  }
  const selected = await getProject(projectId)
  if (!selected) {
    throw new RuntimeRequestError("ProjectNotFound", "Project not found.")
  }
  const supervisor = getRuntimeSupervisor()
  const resources =
    (await supervisor.knownResourceCatalogIfCurrent(selected.path)) ??
    (await supervisor.resourceCatalog(selected.path))
  const sessionIds = supervisor.webUiExtensionSessionIds(selected.id)
  const catalog = await webUiExtensionCatalog(
    {
      cwd: selected.path,
      projectId: selected.id,
      projectTrusted: resources.projectTrusted,
    },
    options
  )
  catalog.statuses = supervisor.webUiExtensionStatuses(sessionIds)
  return {
    selectedProjectId: selected.id,
    sessionIds,
    catalog,
  }
}

export async function loadWebUiExtensionSettings(
  projectId: SettingsProjectParam
) {
  const projects = await listWorkspaceProjects()
  const selection = selectSettingsProject(projects, projectId)
  if (selection.invalid) return null
  const selected = selection.project
  const context = await loadWebUiExtensionCatalog(selected?.id ?? null)
  return {
    projects: projects.map(({ id, name, path }) => ({ id, name, path })),
    ...context,
    mutationToken: getMutationToken(),
  }
}
