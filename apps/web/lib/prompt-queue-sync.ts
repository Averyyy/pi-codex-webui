import type { QueuedPromptItem } from "@workspace/runtime-protocol"

export function reconcilePromptQueueMutation(
  current: QueuedPromptItem[],
  response: QueuedPromptItem[],
  revisionAtStart: number,
  currentRevision: number
) {
  return revisionAtStart === currentRevision ? response : current
}
