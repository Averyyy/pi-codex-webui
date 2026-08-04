export function newestSettingsRevision<T extends { revision: number }>(
  current: T,
  incoming: T
) {
  return incoming.revision >= current.revision ? incoming : current
}
