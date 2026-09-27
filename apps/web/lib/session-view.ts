import "server-only"

import { getDatabase } from "./database"
import { getEventHub } from "./event-hub"
import { getRuntimeSupervisor } from "./runtime-supervisor"
import { getSessionTranscriptPage } from "./session-transcript"
import type { SessionView } from "./session-view-types"

export async function getSessionView(
  sessionId: string,
  previousLeaf?: string | null,
  syncSelectedFile = false
): Promise<SessionView | null> {
  const supervisor = getRuntimeSupervisor()
  for (;;) {
    const live = supervisor.liveState(sessionId)
    let sync =
      syncSelectedFile || live === null || live.state.messages.length === 0
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
    const snapshot = await getSessionTranscriptPage(sessionId, {
      sync,
      ...(live && !syncSelectedFile ? { leafId: live.baseLeafId } : {}),
      previousLeaf,
    })
    if (!snapshot) return null
    const current = supervisor.liveState(sessionId)
    if (current && current.baseLeafId !== snapshot.history!.leafId) {
      if (!syncSelectedFile) continue
      if (
        current.state.messages.length > 0 ||
        current.state.tools.length > 0 ||
        ["starting", "busy", "stopping"].includes(
          current.state.runtimeStatus ?? ""
        )
      ) {
        throw new Error(
          "The session file changed while the runtime had active output. Reload the selected session after the current turn ends."
        )
      }
    }
    const runtime = supervisor.state(sessionId)
    return {
      snapshot,
      runtime,
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
