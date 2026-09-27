import type {
  RuntimeSnapshot,
  RuntimeStatus,
} from "@workspace/runtime-protocol"

export interface SessionRuntimeStatePayload {
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
}

export interface SessionRuntimeLeaseResult {
  state: SessionRuntimeStatePayload
  generation: number
  queueRevision: number
}
