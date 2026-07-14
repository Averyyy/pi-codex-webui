"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArchiveIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"
import type { ArchivedSession } from "@/lib/session-types"

export function ArchivedSessions({
  initial,
  mutationToken,
}: {
  initial: ArchivedSession[]
  mutationToken: string
}) {
  const router = useRouter()
  const [sessions, setSessions] = useState(initial)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function deleteSession(sessionId: string) {
    if (!window.confirm("永久删除这个归档对话？对应的 Pi JSONL 也会被删除。")) {
      return
    }
    setDeleting(sessionId)
    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error ?? "删除归档对话失败。")
      }
      setSessions((current) =>
        current.filter((session) => session.id !== sessionId)
      )
      router.refresh()
      toast.success("归档对话已删除。")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setDeleting(null)
    }
  }

  if (!sessions.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        暂无归档对话。
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {sessions.map((session) => (
        <Card key={session.id}>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate">
                <ArchiveIcon className="mr-2 inline-block size-4 text-muted-foreground" />
                {displaySessionTitle(session)}
              </CardTitle>
              <CardDescription className="mt-1">
                {session.projectName ?? "独立任务"} · 归档于{" "}
                {formatTimestamp(session.archivedAt ?? session.updatedAt)}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={deleting !== null}
              onClick={() => void deleteSession(session.id)}
            >
              {deleting === session.id ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <Trash2Icon />
              )}
              删除
            </Button>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
