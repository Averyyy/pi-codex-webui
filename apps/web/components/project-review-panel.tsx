"use client"

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
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

import { GitDiffSurface } from "@/components/git-diff-surface"
import { useI18n } from "@/components/i18n-provider"
import { responseJson } from "@/lib/api-response"
import { projectGitErrorCopy } from "@/lib/project-git-display"
import type { ProjectGitDiff, ProjectGitStatus } from "@/lib/project-git"

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
  const { locale, t } = useI18n()
  const [git, setGit] = useState(initialGit)
  const [selectedPath, setSelectedPath] = useState(() =>
    firstChangedPath(initialGit)
  )
  const [diff, setDiff] = useState<ProjectGitDiff | null>(null)
  const [diffLoading, setDiffLoading] = useState(selectedPath !== null)
  const [diffRevision, setDiffRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const statusRequest = useRef<AbortController | null>(null)
  const fileButtons = useRef(new Map<string, HTMLButtonElement>())
  const pendingSelectionFocus = useRef<string | null>(null)

  const refresh = useEffectEvent(async (changedPath: string | null) => {
    statusRequest.current?.abort()
    const controller = new AbortController()
    statusRequest.current = controller
    const body = await responseJson<ProjectGitStatus>(
      await fetch(`/api/v1/projects/${projectId}/git`, {
        signal: controller.signal,
      })
    )
    setError(null)
    const nextPath = body.available
      ? body.files.some((file) => file.path === selectedPath)
        ? selectedPath
        : (body.files[0]?.path ?? null)
      : null
    if (
      selectedPath &&
      nextPath &&
      nextPath !== selectedPath &&
      document.activeElement === fileButtons.current.get(selectedPath)
    ) {
      pendingSelectionFocus.current = nextPath
    }
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

  useLayoutEffect(() => {
    const path = pendingSelectionFocus.current
    if (!path) return
    const button = fileButtons.current.get(path)
    if (!button) return
    pendingSelectionFocus.current = null
    button.focus()
  }, [git, selectedPath])

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
      .then((response) => responseJson<ProjectGitDiff>(response))
      .then(setDiff)
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
          <EmptyTitle>{t("project.git.unavailable")}</EmptyTitle>
          <EmptyDescription>
            {projectGitErrorCopy(git.error, locale)}
          </EmptyDescription>
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
          <EmptyTitle>{t("project.review.cleanTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("project.review.cleanDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex size-full min-h-0 flex-col bg-background">
      <div className="flex max-h-48 min-h-20 shrink-0 flex-col border-b">
        <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-3 text-xs">
          <GitBranchIcon className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {git.branch ?? t("project.git.detachedHead")}
          </span>
          <Badge
            variant="outline"
            aria-label={t(
              git.files.length === 1
                ? "project.review.changeCountOne"
                : "project.review.changeCount",
              { count: git.files.length.toLocaleString(locale) }
            )}
          >
            {git.files.length.toLocaleString(locale)}
          </Badge>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="p-1.5" aria-label={t("project.review.fileList")}>
            {git.files.map((file) => (
              <button
                key={file.path}
                ref={(node) => {
                  if (node) fileButtons.current.set(file.path, node)
                  else fileButtons.current.delete(file.path)
                }}
                type="button"
                className="flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[active=true]:bg-muted"
                data-active={file.path === selectedPath}
                data-review-path={file.path}
                aria-pressed={file.path === selectedPath}
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
          </nav>
        </ScrollArea>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {diffLoading ? (
          <Skeleton className="m-3 h-72" />
        ) : error ? (
          <Empty className="min-h-72">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileDiffIcon />
              </EmptyMedia>
              <EmptyTitle>{t("project.review.diffReadFailed")}</EmptyTitle>
              <EmptyDescription>
                {projectGitErrorCopy(error, locale)}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : diff?.hunks.length ? (
          <GitDiffSurface key={`${diff.path}:${diffRevision}`} diff={diff} />
        ) : (
          <Empty className="min-h-72">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileDiffIcon />
              </EmptyMedia>
              <EmptyTitle>{t("project.review.noTextDiffTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("project.review.noTextDiffDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ScrollArea>
    </div>
  )
}
