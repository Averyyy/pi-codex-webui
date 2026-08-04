export type SettingsProjectParam = string | string[] | undefined

export function selectSettingsProject<Project extends { id: string }>(
  projects: Project[],
  requestedProjectId: SettingsProjectParam
) {
  if (requestedProjectId === undefined) {
    return { project: projects[0] ?? null, invalid: false }
  }

  if (typeof requestedProjectId !== "string") {
    return { project: null, invalid: true }
  }

  const project = projects.find(({ id }) => id === requestedProjectId) ?? null
  return { project, invalid: project === null }
}
