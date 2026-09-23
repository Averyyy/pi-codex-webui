import type {
  RuntimeSnapshot,
  RuntimeStatus,
} from "@workspace/runtime-protocol"

export interface CachedRuntimeState {
  status: RuntimeStatus
  snapshot: RuntimeSnapshot | null
}

const keyFor = (sessionId: string) => `pi-webui:runtime-state:${sessionId}`

export function readCachedRuntimeState(sessionId: string) {
  try {
    const raw = sessionStorage.getItem(keyFor(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedRuntimeState
    if (!parsed || typeof parsed !== "object") return null
    return parsed
  } catch {
    return null
  }
}

export function writeCachedRuntimeState(
  sessionId: string,
  state: CachedRuntimeState
) {
  try {
    // Keep the last non-null snapshot so a reconnect cycle never blanks the
    // cached composer state.
    if (state.snapshot === null) return
    sessionStorage.setItem(keyFor(sessionId), JSON.stringify(state))
  } catch {
    // Persistence is best-effort.
  }
}
