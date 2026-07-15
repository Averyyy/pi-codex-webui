import "server-only"

import { mkdir } from "node:fs/promises"

import {
  getProjectRuntimeTarget,
  getSessionSnapshot,
  listWorkspaceProjects,
} from "@/lib/catalog"
import { getAppPaths } from "@/lib/app-paths"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export async function resolveModelSettingsCwd(sessionId?: string) {
  if (sessionId) {
    const session = await getSessionSnapshot(sessionId)
    return session?.session.cwd ?? null
  }

  const projects = await listWorkspaceProjects()
  return projects[0]?.path ?? process.cwd()
}

export async function loadModelSettings(sessionId?: string) {
  const cwd = await resolveModelSettingsCwd(sessionId)
  if (!cwd) return null

  return {
    settings: await getRuntimeSupervisor().modelSettings(cwd),
    sessionId: sessionId ?? null,
    mutationToken: getMutationToken(),
  }
}

export async function resolveNewConversationModelSettingsCwd(
  projectId: string | null
) {
  if (projectId) {
    return (await getProjectRuntimeTarget(projectId))?.cwd ?? null
  }

  const cwd = getAppPaths().taskWorkspace
  await mkdir(cwd, { recursive: true, mode: 0o700 })
  return cwd
}

export async function loadNewConversationModelSettings(
  projectId: string | null
) {
  const cwd = await resolveNewConversationModelSettingsCwd(projectId)
  return cwd ? getRuntimeSupervisor().modelSettings(cwd) : null
}
