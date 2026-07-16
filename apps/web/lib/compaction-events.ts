export type CompactionEndOutcome =
  | { kind: "aborted" }
  | { kind: "complete" }
  | { kind: "failed"; message: string }

export function compactionEndOutcome(payload: unknown): CompactionEndOutcome {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("aborted" in payload) ||
    typeof payload.aborted !== "boolean"
  ) {
    throw new Error("Runtime emitted an invalid compaction event.")
  }
  if ("errorMessage" in payload) {
    if (
      typeof payload.errorMessage !== "string" ||
      payload.errorMessage.length === 0
    ) {
      throw new Error("Runtime emitted an invalid compaction failure event.")
    }
    return { kind: "failed", message: payload.errorMessage }
  }
  if (payload.aborted) return { kind: "aborted" }
  if (
    !("result" in payload) ||
    typeof payload.result !== "object" ||
    payload.result === null
  ) {
    throw new Error("Runtime emitted an invalid compaction completion event.")
  }
  return { kind: "complete" }
}
