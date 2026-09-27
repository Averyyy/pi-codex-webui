import { notFound } from "next/navigation"

import { SessionRouteSlot } from "@/components/session-viewport-host"
import { loadConfig } from "@/lib/config"
import { hasTintinSubagentsExtension } from "@/lib/subagents"
import { isProjectDirectoryAvailable } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { getSessionRouteIdentity } from "@/lib/session-route-identity"
import type { SessionRouteClientData } from "@/lib/session-route-client"
import { projectFileManager } from "@/lib/project-reveal"

export async function SessionScreen({
  sessionId,
  projectId,
}: {
  sessionId: string
  projectId: string | null
}) {
  const [routeIdentity, config] = await Promise.all([
    getSessionRouteIdentity(sessionId),
    loadConfig(),
  ])
  if (!routeIdentity || routeIdentity.session.projectId !== projectId)
    notFound()
  const { session } = routeIdentity

  const supervisor = getRuntimeSupervisor()
  const workspaceAvailable = await isProjectDirectoryAvailable(session.cwd)
  const knownResources = workspaceAvailable
    ? await supervisor.knownResourceCatalogIfCurrent(session.cwd)
    : null
  const runtimeStatus = supervisor.state(sessionId).status
  const fileManager = projectFileManager(process.platform)
  const identityKey = JSON.stringify([
    session.id,
    session.projectId,
    session.runtimeProfileId,
    session.runtimeKind,
    session.cwd,
    session.projectPath,
    session.nativeSessionFile,
  ])
  const route: SessionRouteClientData = {
    session,
    nativeFileChanged: routeIdentity.nativeFileChanged,
    nativeFileRevision: routeIdentity.nativeFileRevision,
    identityKey,
    projectId,
    workspaceAvailable,
    projectTrusted:
      projectId === null ? false : (knownResources?.projectTrusted ?? null),
    subagentsInstalled: knownResources
      ? hasTintinSubagentsExtension(knownResources)
      : null,
    mutationToken: getMutationToken(),
    runtime: { status: runtimeStatus, snapshot: null },
    runtimeProfiles: Object.entries(config.developer.runtime.profiles)
      .filter(([, profile]) => profile.enabled)
      .map(([id, profile]) => ({
        id,
        label: profile.kind === "pi" ? "Pi" : "Pi Client",
      })),
    fileManagerKind:
      fileManager?.kind === "file-explorer"
        ? "explorer"
        : (fileManager?.kind ?? null),
  }

  return <SessionRouteSlot route={route} />
}
