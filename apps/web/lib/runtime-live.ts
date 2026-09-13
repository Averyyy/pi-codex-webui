import { SessionStreamStore } from "./session-stream-store"
import { applySessionLiveEvent } from "./session-live-events"
import type { RuntimeStatus } from "@workspace/runtime-protocol"

export class RuntimeLiveState {
  readonly store: SessionStreamStore
  revision = 0
  constructor(public baseLeafId: string | null) {
    let id = 0
    const callbacks = new Map<number, () => void>()
    this.store = new SessionStreamStore({
      request(callback) {
        const current = ++id
        callbacks.set(current, callback)
        queueMicrotask(() => {
          const run = callbacks.get(current)
          callbacks.delete(current)
          run?.()
        })
        return current
      },
      cancel(handle) {
        callbacks.delete(handle)
      },
    })
    this.store.setRuntimeStatus("ready")
  }
  apply(event: { type: string; payload: unknown }) {
    this.revision++
    applySessionLiveEvent(this.store, event)
  }
  checkpoint(revision: number, leafId: string | null) {
    if (this.revision !== revision) return false
    this.baseLeafId = leafId
    this.store.clear(true)
    return true
  }
  capture(status: RuntimeStatus) {
    const state = this.store.capture()
    return {
      baseLeafId: this.baseLeafId,
      state: { ...state, runtimeStatus: status },
      revision: this.revision,
    }
  }
}
