import "server-only"

import { getSessionSnapshot, listWorkspaceProjects } from "@/lib/catalog"
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
