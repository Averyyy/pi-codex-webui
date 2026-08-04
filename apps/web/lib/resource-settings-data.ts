import "server-only"

import { listWorkspaceProjects } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import {
  selectSettingsProject,
  type SettingsProjectParam,
} from "@/lib/settings-project-selection"

export async function loadResourceSettings(projectId: SettingsProjectParam) {
  const projects = await listWorkspaceProjects()
  const selection = selectSettingsProject(projects, projectId)
  if (selection.invalid) return null
  const selected = selection.project
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
