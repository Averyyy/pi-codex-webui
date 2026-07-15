"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { CheckCircle2Icon, FileDiffIcon, GitBranchIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Skeleton } from "@workspace/ui/components/skeleton"

import type { ProjectGitDiff, ProjectGitStatus } from "@/lib/project-git"

const GitDiffSurface = dynamic(
  () =>
    import("@/components/git-diff-surface").then(
      (module) => module.GitDiffSurface
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="m-3 h-72" />,
  }
)

function firstChangedPath(status: ProjectGitStatus) {
  return status.available ? (status.files[0]?.path ?? null) : null
}

export function ProjectReviewPanel({
  projectId,
  initialGit,
}: {
  projectId: string
  initialGit: ProjectGitStatus
}) {
  const [git, setGit] = useState(initialGit)
  const [selectedPath, setSelectedPath] = useState(() =>
    firstChangedPath(initialGit)
  )
  const [diff, setDiff] = useState<ProjectGitDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(selectedPath !== null)
  const [diffRevision, setDiffRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const statusRequest = useRef<AbortController | null>(null)

  const refresh = useEffectEvent(async (changedPath: string | null) => {
    statusRequest.current?.abort()
    const controller = new AbortController()
    statusRequest.current = controller
    const response = await fetch(`/api/v1/projects/${projectId}/git`, {
      signal: controller.signal,
    })
    const body = (await response.json()) as ProjectGitStatus & {
      error?: string
    }
    if (!response.ok) {
      throw new Error(
        body.error ?? `Git 状态读取失败（HTTP ${response.status}）。`
      )
    }
    setError(null)
    const nextPath = body.available
      ? body.files.some((file) => file.path === selectedPath)
        ? selectedPath
        : (body.files[0]?.path ?? null)
      : null
    const statusChanged = JSON.stringify(body) !== JSON.stringify(git)
    const diffChanged =
      statusChanged ||
      changedPath === null ||
      changedPath === selectedPath ||
      changedPath.startsWith(".git/")
    if (statusChanged) setGit(body)
    setSelectedPath(nextPath)
    if (diffChanged) {
      setDiffLoading(nextPath !== null)
      setDiffRevision((value) => value + 1)
    }
  })

  useEffect(() => {
    const changes = new EventSource(`/api/v1/projects/${projectId}/changes`)
    const update = (source: Event) => {
      const change = JSON.parse((source as MessageEvent<string>).data) as {
        path: string | null
      }
      void refresh(change.path).catch((failure: unknown) => {
        if (!(
          failure instanceof DOMException && failure.name === "AbortError"
        )) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      })
    }
    changes.addEventListener("project.change", update)
    return () => {
      changes.close()
      statusRequest.current?.abort()
    }
  }, [projectId])

  useEffect(() => {
    if (!selectedPath) return
    const controller = new AbortController()
    const query = new URLSearchParams({ path: selectedPath })
    void fetch(`/api/v1/projects/${projectId}/git?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ProjectGitDiff & {
          error?: string
        }
        if (!response.ok) {
          throw new Error(
            body.error ?? `代码差异读取失败（HTTP ${response.status}）。`
          )
        }
        setDiff(body)
      })
      .catch((failure: unknown) => {
        if (!(
          failure instanceof DOMException && failure.name === "AbortError"
        )) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiffLoading(false)
      })
    return () => controller.abort()
  }, [diffRevision, projectId, selectedPath])

  function selectPath(path: string) {
    setDiff(null)
    setDiffLoading(true)
    setError(null)
    setSelectedPath(path)
  }

  if (!git.available) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitBranchIcon />
          </EmptyMedia>
          <EmptyTitle>Git 不可用</EmptyTitle>
          <EmptyDescription>{git.error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!git.files.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2Icon />
          </EmptyMedia>
          <EmptyTitle>工作区没有变更</EmptyTitle>
          <EmptyDescription>
            审阅显示当前工作区相对 HEAD 的改动。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid size-full min-h-0 grid-cols-[10rem_minmax(0,1fr)] bg-background">
      <div className="flex min-h-0 min-w-0 flex-col border-r">
        <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs">
          <GitBranchIcon className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {git.branch ?? "Detached HEAD"}
          </span>
          <Badge variant="outline">{git.files.length}</Badge>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-1.5">
            {git.files.map((file) => (
              <button
                key={file.path}
                type="button"
                className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[active=true]:bg-muted"
                data-active={file.path === selectedPath}
                onClick={() => selectPath(file.path)}
              >
                <FileDiffIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate font-mono"
                  title={file.path}
                >
                  {file.path}
                </span>
                <code className="text-[10px] text-muted-foreground">
                  {file.index === " " ? "·" : file.index}
                  {file.workingTree === " " ? "·" : file.workingTree}
                </code>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ScrollArea className="min-h-0 min-w-0">
        {diffLoading ? (
          <Skeleton className="m-3 h-72" />
        ) : error ? (
          <Empty className="min-h-72">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileDiffIcon />
              </EmptyMedia>
              <EmptyTitle>无法读取差异</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : diff?.hunks.length ? (
          <GitDiffSurface diff={diff} />
        ) : (
          <Empty className="min-h-72">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileDiffIcon />
              </EmptyMedia>
              <EmptyTitle>没有文本差异</EmptyTitle>
              <EmptyDescription>
                该条目可能只包含文件模式或二进制变更。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ScrollArea>
    </div>
  )
}
