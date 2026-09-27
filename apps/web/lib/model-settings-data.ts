import "server-only"

import { getSessionRuntimeTarget } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import {
  getRuntimeSupervisor,
  type ModelSettingsRuntimeTarget,
} from "@/lib/runtime-supervisor"
import {
  resolveNewSessionRuntime,
  resolveNewTaskRuntime,
} from "@/lib/runtime-profiles"

export async function resolveModelSettingsCwd(sessionId?: string) {
  if (sessionId) {
    const session = await getSessionRuntimeTarget(sessionId)
    return session?.cwd ?? null
  }
  return (await resolveNewTaskRuntime()).cwd
}

export async function resolveModelSettingsTarget(
  sessionId?: string
): Promise<ModelSettingsRuntimeTarget | null> {
  if (sessionId) {
    const session = await getSessionRuntimeTarget(sessionId)
    if (!session) return null
    return {
      cwd: session.cwd,
      runtimeProfileId: session.runtimeProfileId,
      runtimeKind: session.runtimeKind,
    }
  }

  const runtime = await resolveNewTaskRuntime()
  return {
    cwd: runtime.cwd,
    runtimeProfileId: runtime.profileId,
    runtimeKind: runtime.runtimeKind,
  }
}

export async function resolveNewConversationModelSettingsTarget(
  projectId: string | null
): Promise<ModelSettingsRuntimeTarget | null> {
  const runtime = projectId
    ? await resolveNewSessionRuntime(projectId)
    : await resolveNewTaskRuntime()
  return {
    cwd: runtime.cwd,
    runtimeProfileId: runtime.profileId,
    runtimeKind: runtime.runtimeKind,
  }
}

export async function resolveModelSettingsRequestTarget(options: {
  sessionId?: string
  projectId?: string
  newTask?: boolean
}) {
  if (options.projectId !== undefined || options.newTask) {
    return resolveNewConversationModelSettingsTarget(options.projectId ?? null)
  }
  return resolveModelSettingsTarget(options.sessionId)
}

export async function loadModelSettings(sessionId?: string) {
  const target = await resolveModelSettingsTarget(sessionId)
  if (!target) return null

  return {
    settings: await getRuntimeSupervisor().modelSettings(target),
    sessionId: sessionId ?? null,
    mutationToken: getMutationToken(),
  }
}

export async function resolveNewConversationModelSettingsCwd(
  projectId: string | null
) {
  return (
    (await resolveNewConversationModelSettingsTarget(projectId))?.cwd ?? null
  )
}

export async function loadNewConversationModelSettings(
  projectId: string | null
) {
  const target = await resolveNewConversationModelSettingsTarget(projectId)
  return target ? getRuntimeSupervisor().modelSettings(target, "enabled") : null
}
