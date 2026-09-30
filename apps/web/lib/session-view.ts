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

function liveBoundaryChanged(before: LiveState, after: LiveState) {
  return (
    before?.instance !== after?.instance ||
    before?.baseLeafId !== after?.baseLeafId ||
    hasActiveOutput(before) !== hasActiveOutput(after)
  )
}

function selectedFileConflict() {
  return new RuntimeRequestError(
    "SessionFileChanged",
    "The native session file changed while the runtime had active output. Reload the selected session after the current turn ends."
  )
}

export async function getSessionView(
  sessionId: string,
  previousLeaf?: string | null,
  syncSelectedFile = false
): Promise<SessionView | null> {
  const supervisor = getRuntimeSupervisor()
  let guardedInstance: object | undefined
  let guardedBaseLeaf: string | null | undefined
  let guardedGeneration: number | undefined
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
    const database =
      live !== null || active ? await getDatabase() : null
    const generationBefore =
      active && database
        ? (
            database
              .prepare("SELECT index_generation FROM sessions WHERE id = ?")
              .get(sessionId) as { index_generation: number } | undefined
          )?.index_generation
        : undefined
    const liveBaseIndexed =
      live?.baseLeafId === null ||
      Boolean(
        live?.baseLeafId &&
          database
            ?.prepare(
              "SELECT 1 FROM session_entries WHERE session_id = ? AND entry_id = ? AND byte_offset IS NOT NULL"
            )
            .get(sessionId, live.baseLeafId)
      )
    if (live && !liveBaseIndexed) sync = true
    const checkpointAdvanced =
      live !== null &&
      live.instance === guardedInstance &&
      guardedBaseLeaf !== undefined &&
      live.baseLeafId !== guardedBaseLeaf &&
      !hasActiveOutput(live)
    if (
      active &&
      live?.instance &&
      (guardedInstance !== live.instance || checkpointAdvanced)
    ) {
      guardedInstance = live.instance
      guardedBaseLeaf = live.baseLeafId
      guardedGeneration =
        liveBaseIndexed && !sync ? generationBefore : undefined
    }
    let snapshot
    try {
      snapshot = await getSessionTranscriptPage(sessionId, {
        sync,
        ...(live && (!syncSelectedFile || selectedFileSyncDeferred)
          ? { leafId: live.baseLeafId }
          : {}),
        previousLeaf,
      })
    } catch (error) {
      // Retry only if another runtime or checkpoint superseded this read.
      const current = supervisor.liveState(sessionId)
      if (!liveBoundaryChanged(live, current)) throw error
      const checkpointAdvancedDuringRead =
        live !== null &&
        live.instance === current?.instance &&
        live.baseLeafId !== current?.baseLeafId &&
        !hasActiveOutput(current)
      const generationAfter = database
        ? (
            database
              .prepare("SELECT index_generation FROM sessions WHERE id = ?")
              .get(sessionId) as { index_generation: number } | undefined
          )?.index_generation
        : undefined
      if (
        active &&
        live?.instance === current?.instance &&
        guardedGeneration !== undefined &&
        !checkpointAdvancedDuringRead &&
        generationAfter !== guardedGeneration
      )
        throw selectedFileConflict()
      continue
    }
    if (!snapshot) return null
    const current = supervisor.liveState(sessionId)
    if (live?.instance !== current?.instance) continue
    const generationAfter = database
      ? (
          database
            .prepare("SELECT index_generation FROM sessions WHERE id = ?")
            .get(sessionId) as { index_generation: number } | undefined
        )?.index_generation
      : undefined
    const checkpointAdvancedAfterRead =
      live !== null &&
      live.instance === current?.instance &&
      live.baseLeafId !== current?.baseLeafId &&
      !hasActiveOutput(current)
    if (active && live?.instance === guardedInstance) {
      if (guardedGeneration === undefined && snapshot.history)
        guardedGeneration = snapshot.history.generation
      if (
        guardedGeneration !== undefined &&
        !checkpointAdvancedAfterRead &&
        (snapshot.history?.generation !== guardedGeneration ||
          generationAfter !== guardedGeneration)
      )
        throw selectedFileConflict()
    }
    if (liveBoundaryChanged(live, current)) continue

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
          stable.instance !== current.instance ||
          stable.revision !== capturedRevision ||
          stable.baseLeafId !== capturedBaseLeaf
        )
          continue
        snapshot = baseSnapshot
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
