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

  const body = (await response.json()) as AddedProject & { error?: string }
  if (!response.ok) {
    throw new Error(body.error ?? `操作失败（HTTP ${response.status}）。`)
  }
  return body
}
