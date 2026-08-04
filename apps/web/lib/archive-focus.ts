export function nextArchiveFocusTarget(
  sessionIds: readonly string[],
  deletedSessionId: string
) {
  const deletedIndex = sessionIds.indexOf(deletedSessionId)
  if (deletedIndex < 0) return null
  return sessionIds[deletedIndex + 1] ?? sessionIds[deletedIndex - 1] ?? null
}
