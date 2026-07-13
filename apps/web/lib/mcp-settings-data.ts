import "server-only"

import { getProject, listWorkspaceProjects } from "./catalog"
import { getMcpService } from "./mcp-service"
import { getMutationToken } from "./request-security"
import { RuntimeRequestError } from "./runtime-error"
import { getRuntimeSupervisor } from "./runtime-supervisor"

export async function resolveMcpContext(projectId: string | null) {
  if (!projectId) {
    return {
      projectId: null,
      projectPath: null,
      projectTrusted: false,
    }
  }
  const project = await getProject(projectId)
  if (!project) {
    throw new RuntimeRequestError("ProjectNotFound", "Project not found.")
  }
  const resources = await getRuntimeSupervisor().resourceCatalog(project.path)
  return {
    projectId: project.id,
    projectPath: project.path,
    projectTrusted: resources.projectTrusted,
  }
}

export async function loadMcpSettings(projectId?: string) {
  const projects = await listWorkspaceProjects()
  const selected =
    projects.find((project) => project.id === projectId) ?? projects[0] ?? null
  const context = await resolveMcpContext(selected?.id ?? null)
  return {
    projects: projects.map(({ id, name, path }) => ({ id, name, path })),
    catalog: await getMcpService().catalog(context),
    mutationToken: getMutationToken(),
  }
}
