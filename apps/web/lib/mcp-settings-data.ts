import "server-only"

import path from "node:path"

import { getAppPaths, getPiAgentDir } from "./app-paths"
import { getProject, listWorkspaceProjects } from "./catalog"
import { loadConfig } from "./config"
import { readMcpConfigFile } from "./mcp-config"
import { getMutationToken } from "./request-security"
import { RuntimeRequestError } from "./runtime-error"
import { getRuntimeSupervisor } from "./runtime-supervisor"
import {
  selectSettingsProject,
  type SettingsProjectParam,
} from "./settings-project-selection"

export async function resolveMcpContext(projectId: string | null) {
  if (!projectId)
    return { projectId: null, projectPath: null, projectTrusted: false }
  const project = await getProject(projectId)
  if (!project)
    throw new RuntimeRequestError("ProjectNotFound", "Project not found.")
  const resources = await getRuntimeSupervisor().currentResourceCatalog(
    project.path
  )
  return {
    projectId: project.id,
    projectPath: project.path,
    projectTrusted: resources.projectTrusted,
  }
}

export async function readMcpSettings(projectId: string | null) {
  const context = await resolveMcpContext(projectId)
  const [global, project] = await Promise.all([
    readMcpConfigFile(path.join(getPiAgentDir(), "mcp.json")),
    context.projectPath
      ? readMcpConfigFile(path.join(context.projectPath, ".pi", "mcp.json"))
      : null,
  ])
  return {
    projectId: context.projectId,
    projectTrusted: context.projectTrusted,
    files: { global, project },
  }
}

export async function loadMcpSettings(projectId: SettingsProjectParam) {
  const [projects, config] = await Promise.all([
    listWorkspaceProjects(),
    loadConfig(),
  ])
  const selection = selectSettingsProject(projects, projectId)
  if (selection.invalid) return null
  const legacyServers =
    typeof config.mcp === "object" &&
    config.mcp !== null &&
    "servers" in config.mcp
      ? config.mcp.servers
      : undefined
  const legacyMcpServerCount =
    typeof legacyServers === "object" &&
    legacyServers !== null &&
    !Array.isArray(legacyServers)
      ? Object.keys(legacyServers).length
      : 0
  return {
    projects: projects.map(({ id, name, path }) => ({ id, name, path })),
    catalog: await readMcpSettings(selection.project?.id ?? null),
    mutationToken: getMutationToken(),
    legacyMcpServerCount,
    legacyMcpConfigPath: getAppPaths().config,
  }
}
