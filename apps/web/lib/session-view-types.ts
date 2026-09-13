import type {
  RuntimeSnapshot,
  RuntimeStatus,
} from "@workspace/runtime-protocol"
import type { SessionLiveSnapshot } from "./session-stream-store"
import type { SessionSnapshot } from "./session-types"

export interface SessionView {
  snapshot: SessionSnapshot
  eventCursor: string
  live: SessionLiveSnapshot
  runtime: { status: RuntimeStatus; snapshot: RuntimeSnapshot | null }
}
