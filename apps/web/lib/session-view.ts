import "server-only"

import { getDatabase } from "./database"
import { getEventHub } from "./event-hub"
import { getRuntimeSupervisor } from "./runtime-supervisor"
import { getSessionTranscriptPage } from "./session-transcript"
import type { SessionView } from "./session-view-types"
import { RuntimeRequestError } from "./runtime-error"

type LiveState = ReturnType<
  ReturnType<typeof getRuntimeSupervisor>["liveState"]
>

function hasActiveOutput(live: LiveState) {
  return (
    live !== null &&
    (live.state.activeMessageIds.length > 0 ||
      live.state.messages.some((message) => !message.complete) ||
      live.state.tools.some((tool) => tool.status === "running"))
  )
}

export async function getSessionView(
  sessionId: string,
  previousLeaf?: string | null,
  syncSelectedFile = false
): Promise<SessionView | null> {
  const supervisor = getRuntimeSupervisor()
  for (;;) {
    const live = supervisor.liveState(sessionId)
    const runtimeBefore = supervisor.state(sessionId)
    const active =
      ["starting", "busy", "stopping"].includes(runtimeBefore.status) ||
      hasActiveOutput(live)
    const selectedFileSyncDeferred = syncSelectedFile && active
    let selectedFileSync: SessionView["selectedFileSync"] =
      selectedFileSyncDeferred ? "deferred" : "complete"
    let sync =
      !active &&
      (syncSelectedFile || live === null || live.state.messages.length === 0)
    if (live?.baseLeafId) {
      const database = await getDatabase()
      if (
        !database
          .prepare(
            "SELECT 1 FROM session_entries WHERE session_id = ? AND entry_id = ? AND byte_offset IS NOT NULL"
          )
          .get(sessionId, live.baseLeafId)
      )
        sync = true
    }
    let snapshot = await getSessionTranscriptPage(sessionId, {
      sync,
      ...(live && (!syncSelectedFile || selectedFileSyncDeferred)
        ? { leafId: live.baseLeafId }
        : {}),
      previousLeaf,
    })
    if (!snapshot) return null
    let current = supervisor.liveState(sessionId)
    let allowExternalIdle = false
    if (
      current &&
      current.baseLeafId !== snapshot.history!.leafId &&
      syncSelectedFile &&
      !selectedFileSyncDeferred
    ) {
      const currentRuntime = supervisor.state(sessionId)
      if (
        ["starting", "busy", "stopping"].includes(currentRuntime.status) ||
        hasActiveOutput(current)
      )
        continue
      if (
        current.state.messages.length === 0 &&
        current.state.tools.length === 0
      ) {
        allowExternalIdle = true
      } else if (!supervisor.settlementPending(sessionId)) {
        throw new RuntimeRequestError(
          "SessionFileChanged",
          "The native session file changed outside the settled runtime. Restart the session runtime before loading the changed history."
        )
      } else {
        const capturedRevision = current.revision
        const capturedBaseLeaf = current.baseLeafId
        const baseSnapshot = await getSessionTranscriptPage(sessionId, {
          sync: false,
          leafId: capturedBaseLeaf,
          previousLeaf,
        })
        if (!baseSnapshot) return null
        const stable = supervisor.liveState(sessionId)
        if (
          !stable ||
          stable.revision !== capturedRevision ||
          stable.baseLeafId !== capturedBaseLeaf
        )
          continue
        snapshot = baseSnapshot
        current = stable
        selectedFileSync = "deferred"
      }
    }
    if (
      current &&
      current.baseLeafId !== snapshot.history!.leafId &&
      !allowExternalIdle
    )
      continue
    const runtime = supervisor.state(sessionId)
    return {
      snapshot,
      runtime,
      selectedFileSync,
      eventCursor: getEventHub().cursor(),
      live: current?.state ?? {
        messages: [],
        tools: [],
        activeMessageIds: [],
        nextMessageId: 0,
        runtimeStatus: runtime.status,
      },
    }
  }
}
