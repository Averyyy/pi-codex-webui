import type {
  RuntimeSnapshot,
  RuntimeStatus,
} from "@workspace/runtime-protocol"
import type { SessionSnapshot } from "@/lib/session-types"

export interface SessionRouteClientData {
  session: SessionSnapshot["session"]
  modelCatalogBinding: {
    catalogIdentity: string
    catalogVersion: string
  } | null
  modelCatalogChecked: boolean
  nativeFileChanged: boolean
  nativeFileRevision: string
  identityKey: string
  projectId: string | null
  workspaceAvailable: boolean
  projectTrusted: boolean | null
  subagentsInstalled: boolean | null
  mutationToken: string
  runtime: { status: RuntimeStatus; snapshot: RuntimeSnapshot | null }
  runtimeProfiles: Array<{ id: string; label: string }>
  fileManagerKind: "finder" | "explorer" | null
}
