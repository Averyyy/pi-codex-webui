import type {
  PiWebCodexManifest,
  WebUiExtensionContribution,
  WebUiRuntime,
} from "@pi-web-codex/extension-sdk"
import type { WebUiExtensionStatus } from "@workspace/runtime-protocol"

export type WebUiExtensionSource =
  "builtin" | "external" | "project" | "development"

export interface WebUiExtensionAsset {
  digest: string
  file: string
  path: string
  url: string
}

export interface DiscoveredWebUiExtension {
  key: string
  source: WebUiExtensionSource
  packageRoot: string
  packageName: string
  packageVersion: string
  manifest: PiWebCodexManifest
  extension: WebUiExtensionContribution
  workerPath: string
  client: WebUiExtensionAsset
  style?: WebUiExtensionAsset
}

export interface WebUiExtensionDiagnostic {
  path: string
  message: string
}

export interface WebUiExtensionPreference {
  enabled: boolean
  rendering: "native" | "tui"
  selectedAdapter: string | null
}

export interface WorkerWebUiAdapterDescriptor {
  key: string
  source: WebUiExtensionSource
  packageName: string
  packageVersion: string
  extension: WebUiExtensionContribution
  workerPath: string
  preference: WebUiExtensionPreference
}

export interface WebUiExtensionCandidateView {
  key: string
  source: WebUiExtensionSource
  packageName: string
  packageVersion: string
  target: WebUiExtensionContribution["target"]
  runtimes: WebUiRuntime[]
  client: Omit<WebUiExtensionAsset, "path">
  style?: Omit<WebUiExtensionAsset, "path">
}

export interface WebUiExtensionGroupView {
  id: string
  name: string
  preference: WebUiExtensionPreference
  candidates: WebUiExtensionCandidateView[]
}

export interface WebUiExtensionCatalogView {
  revision: number
  projectId: string | null
  projectTrusted: boolean
  groups: WebUiExtensionGroupView[]
  diagnostics: WebUiExtensionDiagnostic[]
  statuses: Array<WebUiExtensionStatus & { sessionId: string }>
}
