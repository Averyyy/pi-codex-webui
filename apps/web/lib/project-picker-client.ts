import { responseJson } from "@/lib/api-response"

export interface AddedProject {
  id: string
  name: string
  path: string
}

export async function pickWorkspaceProject(mutationToken: string) {
  const response = await fetch("/api/v1/projects/pick", {
    method: "POST",
    headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
  })
  if (response.status === 204) return null

  return responseJson<AddedProject>(response)
}
