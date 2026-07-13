"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircleIcon, PlusIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function NewSessionButton({
  projectId,
  mutationToken,
}: {
  projectId: string
  mutationToken: string
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createSession() {
    setCreating(true)
    setError(null)
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/sessions`, {
        method: "POST",
        headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
      })
      const result = (await response.json()) as {
        error?: string
        projectId?: string
        sessionId?: string
      }
      if (!response.ok || !result.projectId || !result.sessionId) {
        throw new Error(result.error ?? "创建 Pi session 失败。")
      }
      router.push(`/projects/${result.projectId}/sessions/${result.sessionId}`)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button onClick={createSession} disabled={creating}>
        {creating ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <PlusIcon />
        )}
        新建 session
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
