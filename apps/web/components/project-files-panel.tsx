"use client"

import { useEffect, useState } from "react"
import {
  DownloadIcon,
  FileIcon,
  FileQuestionIcon,
  FolderIcon,
  LinkIcon,
  RefreshCwIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { useI18n } from "@/components/i18n-provider"
import { ApiError, responseJson } from "@/lib/api-response"
import {
  isProjectFileErrorCode,
  projectFileErrorCopy,
  projectFileTypeLabel,
} from "@/lib/project-file-display"
import type {
  ProjectDirectory,
  ProjectFile,
  ProjectFileEntry,
} from "@/lib/project-files"

type ProjectEntry = ProjectDirectory | ProjectFile

function FileTypeIcon({ type }: { type: ProjectFileEntry["type"] }) {
  if (type === "directory") return <FolderIcon className="size-4" />
  if (type === "symbolic-link") return <LinkIcon className="size-4" />
  if (type === "file") return <FileIcon className="size-4" />
  return <FileQuestionIcon className="size-4" />
}

function pathBreadcrumbs(value: string, rootLabel: string) {
  const segments = value.split("/").filter(Boolean)
  return [
    { label: rootLabel, path: "" },
    ...segments.map((label, index) => ({
      label,
      path: segments.slice(0, index + 1).join("/"),
    })),
  ]
}

export function ProjectFilesPanel({ projectId }: { projectId: string }) {
  const { locale, t } = useI18n()
  const [currentPath, setCurrentPath] = useState("")
  const [entry, setEntry] = useState<ProjectEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ path: currentPath })
    void fetch(`/api/v1/projects/${projectId}/files?${query}`, {
      signal: controller.signal,
    })
      .then((response) => responseJson<ProjectEntry>(response))
      .then((nextEntry) => {
        setEntry(nextEntry)
        setError(null)
      })
      .catch((failure: unknown) => {
        if (!(
          failure instanceof DOMException && failure.name === "AbortError"
        )) {
          const message =
            failure instanceof ApiError && isProjectFileErrorCode(failure.code)
              ? projectFileErrorCopy(failure.code, locale).description
              : t("project.files.openFailedWithMessage", {
                  message:
                    failure instanceof Error
                      ? failure.message
                      : String(failure),
                })
          setError(message)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [currentPath, locale, projectId, revision, t])

  function openPath(path: string) {
    if (path === currentPath) {
      refresh()
      return
    }
    setLoading(true)
    setError(null)
    setEntry(null)
    setCurrentPath(path)
  }

  function refresh() {
    setLoading(true)
    setError(null)
    setEntry(null)
    setRevision((value) => value + 1)
  }

  const breadcrumbs = pathBreadcrumbs(
    entry?.path ?? currentPath,
    t("project.files.root")
  )
  const downloadUrl =
    entry?.kind === "file"
      ? `/api/v1/projects/${projectId}/files?${new URLSearchParams({
          path: entry.path,
          download: "1",
        })}`
      : null

  return (
    <div className="flex size-full min-h-0 flex-col bg-background">
      <div className="flex min-h-10 shrink-0 items-center gap-1 border-b px-3">
        <nav
          aria-label={t("project.files.pathAriaLabel")}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-xs text-muted-foreground"
        >
          {breadcrumbs.map((item, index) => (
            <span
              key={item.path || "root"}
              className="flex min-w-0 items-center gap-1"
            >
              <button
                type="button"
                className="truncate rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => openPath(item.path)}
                title={item.label}
                aria-current={
                  index === breadcrumbs.length - 1 ? "page" : undefined
                }
              >
                {item.label}
              </button>
              {index < breadcrumbs.length - 1 ? <span>/</span> : null}
            </span>
          ))}
        </nav>
        {downloadUrl ? (
          <Button asChild variant="ghost" size="icon-sm">
            <a href={downloadUrl} aria-label={t("project.files.download")}>
              <DownloadIcon />
            </a>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("project.files.refresh")}
          onClick={refresh}
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {loading && !entry ? (
        <div className="grid gap-2 p-3">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : error ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestionIcon />
            </EmptyMedia>
            <EmptyTitle>{t("project.files.openFailed")}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : entry?.kind === "directory" ? (
        entry.entries.length ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="divide-y">
              {entry.entries.map((child) => (
                <button
                  key={child.path}
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:opacity-50"
                  disabled={child.type === "other"}
                  onClick={() => openPath(child.path)}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="text-muted-foreground">
                      <FileTypeIcon type={child.type} />
                    </span>
                    <span className="truncate">{child.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {child.type === "file"
                      ? `${child.size.toLocaleString(locale)} B`
                      : projectFileTypeLabel(child.type, locale)}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderIcon />
              </EmptyMedia>
              <EmptyTitle>{t("project.files.emptyDirectory")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )
      ) : entry?.kind === "file" ? (
        entry.preview !== null ? (
          <ScrollArea className="min-h-0 flex-1">
            <pre className="min-w-max p-4 font-mono text-xs leading-5 whitespace-pre">
              {entry.preview}
            </pre>
          </ScrollArea>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileIcon />
              </EmptyMedia>
              <EmptyTitle>{t("project.files.previewUnavailable")}</EmptyTitle>
              <EmptyDescription>
                {entry.previewUnavailable === "binary"
                  ? t("project.files.binaryDescription")
                  : t("project.files.tooLargeDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : null}
    </div>
  )
}
