import type { RuntimeStatus } from "@workspace/runtime-protocol"
import type { ToolResultView } from "@/lib/message-content"
import type { StreamingToolView } from "@/lib/session-stream-store"

export function toolCallStatus(
  live: StreamingToolView | null,
  persistedResult: ToolResultView | undefined,
  runtimeStatus: RuntimeStatus | null
) {
  const result = live?.result ?? persistedResult
  const running =
    live?.status === "running" &&
    (runtimeStatus === null ||
      runtimeStatus === "busy" ||
      runtimeStatus === "starting" ||
      runtimeStatus === "stopping")
  const failed = live?.status === "error" || result?.isError === true
  return {
    running,
    failed,
    incomplete: !running && !failed && (!result || live?.status === "running"),
  }
}
