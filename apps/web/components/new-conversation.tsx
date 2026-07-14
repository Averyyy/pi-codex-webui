"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircleIcon, SendIcon, XIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

const NO_PROJECT = "__none__"

interface NewConversationProject {
  id: string
  name: string
  path: string
}

interface CreatedSession {
  projectId: string | null
  sessionId: string
}

async function responseJson<T>(response: Response) {
  const result = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(result.error ?? `操作失败（HTTP ${response.status}）。`)
  }
  return result
}

export function NewConversation({
  projects,
  initialProjectId,
  mutationToken,
}: {
  projects: NewConversationProject[]
  initialProjectId: string | null
  mutationToken: string
}) {
  const router = useRouter()
  const [projectId, setProjectId] = useState(initialProjectId)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedProject = projects.find((project) => project.id === projectId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    if (!text || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const createResponse = await fetch(
        projectId === null
          ? "/api/v1/tasks"
          : `/api/v1/projects/${encodeURIComponent(projectId)}/sessions`,
        {
          method: "POST",
          headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
        }
      )
      const created = await responseJson<CreatedSession>(createResponse)

      await responseJson(
        await fetch(`/api/v1/sessions/${created.sessionId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({
            message: text,
            images: [],
            streamingBehavior: "followUp",
          }),
        })
      )

      router.push(
        created.projectId === null
          ? `/tasks/${created.sessionId}`
          : `/projects/${created.projectId}/sessions/${created.sessionId}`
      )
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center p-4 md:min-h-svh md:p-8">
      <div className="w-full max-w-2xl rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
        <div className="mb-5 space-y-1">
          <h1 className="text-lg font-semibold">新对话</h1>
          <p className="text-sm text-muted-foreground">
            选择工作项目；发送第一条消息后才会创建对话。
          </p>
        </div>

        <form className="grid gap-3" onSubmit={submit}>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="输入第一条消息"
            aria-label="第一条消息"
            autoFocus
            className="min-h-36 resize-y"
          />

          <div className="group flex items-center gap-2">
            <span className="shrink-0 text-sm text-muted-foreground">
              工作项目
            </span>
            <Select
              value={projectId ?? NO_PROJECT}
              onValueChange={(value) =>
                setProjectId(value === NO_PROJECT ? null : value)
              }
              disabled={!projects.length}
            >
              <SelectTrigger size="sm" className="max-w-full min-w-48">
                <SelectValue placeholder="不使用项目（独立任务）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>
                  不使用项目（独立任务）
                </SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} · {project.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProject ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="不使用项目"
                title="不使用项目"
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => setProjectId(null)}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>

          {!projects.length ? (
            <p className="text-xs text-muted-foreground">
              当前没有可用项目，将创建独立任务。
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={!message.trim() || submitting}>
              {submitting ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <SendIcon />
              )}
              发送并开始
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}
