import { responseJson } from "@/lib/api-response"
import { SESSION_CATALOG_CHANGED } from "@/lib/session-catalog-events"

export interface ProjectSessionRefreshResult {
  projectId: string
  failures: { file: string; message: string }[]
}

export async function refreshProjectSessions(
  projectId: string,
  mutationToken: string
) {
  const result = await responseJson<unknown>(
    await fetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/sessions/refresh`,
      {
        method: "POST",
        headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
      }
    )
  )
  if (
    typeof result !== "object" ||
    result === null ||
    !("projectId" in result) ||
    result.projectId !== projectId ||
    !("failures" in result) ||
    !Array.isArray(result.failures) ||
    result.failures.some(
      (failure) =>
        typeof failure !== "object" ||
        failure === null ||
        typeof failure.file !== "string" ||
        typeof failure.message !== "string"
    )
  ) {
    throw new Error("Invalid project conversation refresh response.")
  }
  window.dispatchEvent(
    new CustomEvent(SESSION_CATALOG_CHANGED, {
      detail: { scope: "project", projectId },
    })
  )
  window.dispatchEvent(
    new CustomEvent(SESSION_CATALOG_CHANGED, { detail: { scope: "pinned" } })
  )
  return result as ProjectSessionRefreshResult
}
