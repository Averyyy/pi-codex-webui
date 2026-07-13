import "server-only"

import type { AppConfig } from "@/lib/config-schema"
import { getProjectRuntimeTarget } from "@/lib/catalog"
import { loadConfig } from "@/lib/config"
import { RuntimeRequestError } from "@/lib/runtime-error"
import { readSecret } from "@/lib/secret-store"

export function normalizeServerUrl(input: string) {
  const value = input.trim()
  if (!value) return ""
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must use http or https.")
  }
  if (url.username || url.password) {
    throw new Error("Server URL must not contain credentials.")
  }
  if (url.search || url.hash) {
    throw new Error("Server URL must not contain a query or fragment.")
  }
  return url.toString().replace(/\/$/, "")
}

export function runtimeProfileViews(config: AppConfig) {
  return Object.entries(config.developer.runtime.profiles).map(
    ([id, profile]) => ({
      id,
      kind: profile.kind,
      enabled: profile.enabled,
      isDefault: config.developer.runtime.default === id,
      ...(profile.kind === "pi-client"
        ? {
            serverUrl: profile.serverUrl,
            hasAuthToken: profile.authTokenRef !== null,
          }
        : {}),
    })
  )
}

export async function getRuntimeProfile(profileId: string) {
  const config = await loadConfig()
  const profile = config.developer.runtime.profiles[profileId]
  if (!profile) {
    throw new RuntimeRequestError(
      "RuntimeProfileNotFound",
      `Runtime profile ${profileId} does not exist.`
    )
  }
  return { config, profile }
}

export async function getEnabledRuntimeProfile(profileId: string) {
  const result = await getRuntimeProfile(profileId)
  if (!result.profile.enabled) {
    throw new RuntimeRequestError(
      "RuntimeProfileDisabled",
      `Runtime profile ${profileId} is disabled.`
    )
  }
  return result
}

export async function runtimeWorkerCredentials(
  profileId: string,
  requireEnabled = true
) {
  const result = requireEnabled
    ? await getEnabledRuntimeProfile(profileId)
    : await getRuntimeProfile(profileId)
  const { profile } = result
  if (profile.kind === "pi") return { kind: "pi" as const }
  if (!profile.serverUrl) {
    throw new RuntimeRequestError(
      "RuntimeProfileIncomplete",
      `Runtime profile ${profileId} has no server URL.`
    )
  }
  return {
    kind: "pi-client" as const,
    serverUrl: profile.serverUrl,
    authToken: profile.authTokenRef
      ? await readSecret(profile.authTokenRef)
      : null,
  }
}

export async function resolveNewSessionRuntime(
  projectId: string,
  explicitProfileId?: string
) {
  const [project, config] = await Promise.all([
    getProjectRuntimeTarget(projectId),
    loadConfig(),
  ])
  if (!project) {
    throw new RuntimeRequestError("ProjectNotFound", "Project not found.")
  }
  const profileId =
    explicitProfileId ??
    project.defaultRuntimeProfileId ??
    config.developer.runtime.default ??
    "pi"
  const profile = config.developer.runtime.profiles[profileId]
  if (!profile) {
    throw new RuntimeRequestError(
      "RuntimeProfileNotFound",
      `Runtime profile ${profileId} does not exist.`
    )
  }
  if (!profile.enabled) {
    throw new RuntimeRequestError(
      "RuntimeProfileDisabled",
      `Runtime profile ${profileId} is disabled.`
    )
  }
  return {
    ...project,
    profileId,
    runtimeKind: profile.kind,
  }
}
