export function nextModelProviderFocusTarget(
  providerIds: string[],
  removedProviderId: string
) {
  const index = providerIds.indexOf(removedProviderId)
  if (index < 0) return null
  return providerIds[index + 1] ?? providerIds[index - 1] ?? null
}
