export type ProjectFilesRouteQueryValue = string | string[] | undefined

export function requestedProjectFilePath(value: ProjectFilesRouteQueryValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

export function projectFilesHref(projectId: string, entryPath: string) {
  const base = `/projects/${projectId}/files`
  if (!entryPath) return base
  return `${base}?${new URLSearchParams({ path: entryPath })}`
}

export function projectFileAttachmentHeader(fileName: string) {
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `attachment; filename*=UTF-8''${encoded}`
}

export function canonicalProjectFilesHref(
  projectId: string,
  value: ProjectFilesRouteQueryValue,
  resolvedPath: string
) {
  if (value === undefined && resolvedPath === "") return null
  if (typeof value === "string" && value === resolvedPath && resolvedPath) {
    return null
  }
  return projectFilesHref(projectId, resolvedPath)
}
