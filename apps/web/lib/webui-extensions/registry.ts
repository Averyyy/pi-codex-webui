import "server-only"

import type { WebUiRuntime } from "@pi-web-codex/extension-sdk"

import { loadConfig } from "@/lib/config"
import { discoverWebUiExtensions } from "./discovery"
import type {
  WebUiExtensionCatalogView,
  WebUiExtensionGroupView,
  WebUiExtensionPreference,
  WorkerWebUiAdapterDescriptor,
} from "./types"

export const DEFAULT_WEBUI_EXTENSION_PREFERENCE: WebUiExtensionPreference = {
  enabled: true,
  rendering: "native",
  selectedAdapter: null,
}

interface RegistryContext {
  cwd?: string
  projectId?: string | null
  projectTrusted?: boolean
}

function preference(
  configured:
    | {
        enabled: boolean
        rendering: "native" | "tui"
        selectedAdapter: string | null
      }
    | undefined
): WebUiExtensionPreference {
  return configured
    ? { ...configured }
    : { ...DEFAULT_WEBUI_EXTENSION_PREFERENCE }
}

export async function webUiExtensionCatalog(
  context: RegistryContext = {}
): Promise<WebUiExtensionCatalogView> {
  const [config, discovered] = await Promise.all([
    loadConfig(),
    discoverWebUiExtensions(context),
  ])
  const groups = new Map<string, WebUiExtensionGroupView>()
  for (const candidate of discovered.extensions) {
    const group = groups.get(candidate.extension.id) ?? {
      id: candidate.extension.id,
      name: candidate.extension.name ?? candidate.extension.id,
      preference: preference(
        config.webuiExtensions.preferences[candidate.extension.id]
      ),
      candidates: [],
    }
    group.candidates.push({
      key: candidate.key,
      source: candidate.source,
      packageName: candidate.packageName,
      packageVersion: candidate.packageVersion,
      target: candidate.extension.target,
      runtimes: candidate.extension.runtimes,
      client: {
        digest: candidate.client.digest,
        file: candidate.client.file,
        url: candidate.client.url,
      },
      ...(candidate.style
        ? {
            style: {
              digest: candidate.style.digest,
              file: candidate.style.file,
              url: candidate.style.url,
            },
          }
        : {}),
    })
    groups.set(group.id, group)
  }
  for (const group of groups.values()) {
    group.candidates.sort((left, right) => left.key.localeCompare(right.key))
  }
  return {
    revision: config.revision,
    projectId: context.projectId ?? null,
    projectTrusted: context.projectTrusted ?? false,
    groups: [...groups.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    diagnostics: discovered.diagnostics,
    statuses: [],
  }
}

export async function webUiAdaptersForRuntime(
  runtime: WebUiRuntime,
  context: RegistryContext = {}
): Promise<WorkerWebUiAdapterDescriptor[]> {
  const [config, discovered] = await Promise.all([
    loadConfig(),
    discoverWebUiExtensions(context),
  ])
  return discovered.extensions
    .filter((candidate) => candidate.extension.runtimes.includes(runtime))
    .map((candidate) => ({
      key: candidate.key,
      source: candidate.source,
      packageName: candidate.packageName,
      packageVersion: candidate.packageVersion,
      extension: candidate.extension,
      workerPath: candidate.workerPath,
      preference: preference(
        config.webuiExtensions.preferences[candidate.extension.id]
      ),
    }))
}
