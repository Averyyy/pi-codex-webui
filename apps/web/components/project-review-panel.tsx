"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
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
import { useProjectGitStatus } from "@/lib/project-git-store"

export function ProjectReviewPanel({
  projectId,
  initialGit,
}: {
  projectId: string
  initialGit: ProjectGitStatus | null
}) {
  const { locale, t } = useI18n()
  const { snapshot: gitSnapshot } = useProjectGitStatus(projectId, initialGit)
  const git = gitSnapshot.status
  const [preferredSelectedPath, setPreferredSelectedPath] = useState<
    string | null
  >(null)
  const selectedPath =
    git?.available &&
    git.files.some((file) => file.path === preferredSelectedPath)
      ? preferredSelectedPath
      : git?.available
        ? (git.files[0]?.path ?? null)
        : null
  const [diff, setDiff] = useState<ProjectGitDiff | null>(null)
  const [completedDiff, setCompletedDiff] = useState<{
    key: string
    changeSequence: number
  } | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const fileButtons = useRef(new Map<string, HTMLButtonElement>())
  const focusedPath = useRef<string | null>(null)
  const diffKey = selectedPath
    ? JSON.stringify([projectId, selectedPath])
    : null
  const diffChangeRelevant =
    gitSnapshot.changeSequence <= 1 ||
    gitSnapshot.changedPath === null ||
    gitSnapshot.changedPath === selectedPath ||
    gitSnapshot.changedPath.startsWith(".git/")
  const hasCurrentDiff = Boolean(
    diffKey &&
    completedDiff?.key === diffKey &&
    (!diffChangeRelevant ||
      completedDiff.changeSequence === gitSnapshot.changeSequence)
  )
  const diffLoading = diffKey !== null && !hasCurrentDiff
  const error = diffError ?? gitSnapshot.error

  useEffect(() => {
    const clearFocusedPath = () => {
      focusedPath.current = null
    }
    window.addEventListener("blur", clearFocusedPath)
    return () => window.removeEventListener("blur", clearFocusedPath)
  }, [])

  useLayoutEffect(() => {
    const previousPath = focusedPath.current
    if (
      !previousPath ||
      (git?.available && git.files.some((file) => file.path === previousPath))
    )
      return
    const button = selectedPath
      ? fileButtons.current.get(selectedPath)
      : undefined
    if (!button) return
    button.focus()
    focusedPath.current = selectedPath
  }, [git, gitSnapshot.changeSequence, selectedPath])

  useEffect(() => {
    if (!selectedPath || !diffKey) return
    if (
      completedDiff?.key === diffKey &&
      (!diffChangeRelevant ||
        completedDiff.changeSequence === gitSnapshot.changeSequence)
    ) {
      return
    }
    const controller = new AbortController()
    const changeSequence = gitSnapshot.changeSequence
    const query = new URLSearchParams({ path: selectedPath })
    void fetch(`/api/v1/projects/${projectId}/git?${query}`, {
      signal: controller.signal,
    })
      .then((response) => responseJson<ProjectGitDiff>(response))
      .then((nextDiff) => {
        if (controller.signal.aborted) return
        setDiff(nextDiff)
        setDiffError(null)
        setCompletedDiff({ key: diffKey, changeSequence })
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return
        setDiffError(
          failure instanceof Error ? failure.message : String(failure)
        )
        setCompletedDiff({ key: diffKey, changeSequence })
      })
    return () => controller.abort()
  }, [
    completedDiff,
    diffChangeRelevant,
    diffKey,
    gitSnapshot.changeSequence,
    projectId,
    selectedPath,
  ])

  function selectPath(path: string) {
    setDiff(null)
    setDiffError(null)
    setPreferredSelectedPath(path)
  }

  if (!git) {
    return gitSnapshot.error ? (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitBranchIcon />
          </EmptyMedia>
          <EmptyTitle>{t("project.git.unavailable")}</EmptyTitle>
          <EmptyDescription>{gitSnapshot.error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <Skeleton className="m-3 h-72" aria-busy="true" />
    )
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
            {gitSnapshot.error
              ? projectGitErrorCopy(gitSnapshot.error, locale)
              : projectGitErrorCopy(git.error, locale)}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!git.files.length && !gitSnapshot.error) {
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
                onFocus={() => {
                  focusedPath.current = file.path
                }}
                onBlur={(event) => {
                  if (
                    focusedPath.current === file.path &&
                    event.relatedTarget !== null
                  ) {
                    focusedPath.current = null
                  }
                }}
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
          <GitDiffSurface key={`${diff.path}:${diffKey}`} diff={diff} />
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
