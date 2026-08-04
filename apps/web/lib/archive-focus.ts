export function nextArchiveFocusTarget(
  sessionIds: readonly string[],
  removedSessionId: string
) {
  const removedIndex = sessionIds.indexOf(removedSessionId)
  if (removedIndex < 0) return null
  return sessionIds[removedIndex + 1] ?? sessionIds[removedIndex - 1] ?? null
}
