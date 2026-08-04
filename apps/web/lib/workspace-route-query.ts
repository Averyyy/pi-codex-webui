export type WorkspaceRouteQueryValue = string | string[] | undefined

interface ResolvedWorkspaceRouteQuery<T> {
  value: T
  canonicalHref: string | null
}

function firstQueryValue(value: WorkspaceRouteQueryValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

export function resolveNewConversationProjectQuery(
  value: WorkspaceRouteQueryValue,
  availableProjectIds: ReadonlySet<string>
): ResolvedWorkspaceRouteQuery<string | null> {
  if (value === undefined) return { value: null, canonicalHref: null }

  const rawValue = firstQueryValue(value)
  const projectId = rawValue.trim()
  if (!projectId || !availableProjectIds.has(projectId)) {
    return { value: null, canonicalHref: "/new" }
  }

  const canonicalHref = `/new?projectId=${encodeURIComponent(projectId)}`
  return {
    value: projectId,
    canonicalHref:
      Array.isArray(value) || rawValue !== projectId ? canonicalHref : null,
  }
}

export function resolveSearchQuery(
  value: WorkspaceRouteQueryValue
): ResolvedWorkspaceRouteQuery<string> {
  if (value === undefined) return { value: "", canonicalHref: null }

  const rawValue = firstQueryValue(value)
  const query = rawValue.trim()
  const canonicalHref = query
    ? `/search?q=${encodeURIComponent(query)}`
    : "/search"

  return {
    value: query,
    canonicalHref:
      Array.isArray(value) || rawValue !== query || query === ""
        ? canonicalHref
        : null,
  }
}
