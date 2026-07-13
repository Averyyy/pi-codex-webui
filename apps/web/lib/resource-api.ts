import "server-only"

import { getProject } from "@/lib/catalog"
import { RuntimeRequestError } from "@/lib/runtime-error"

export async function requireProject(projectId: string | null) {
  if (!projectId) {
    throw new RuntimeRequestError(
      "ProjectRequired",
      "Choose a project before managing Pi resources."
    )
  }
  const project = await getProject(projectId)
  if (!project) {
    throw new RuntimeRequestError("ProjectNotFound", "Project not found.")
  }
  return project
}
