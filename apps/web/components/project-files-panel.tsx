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

function pathBreadcrumbs(value: string) {
  const segments = value.split("/").filter(Boolean)
  return [
    { label: "root", path: "" },
    ...segments.map((label, index) => ({
      label,
      path: segments.slice(0, index + 1).join("/"),
    })),
  ]
}

export function ProjectFilesPanel({ projectId }: { projectId: string }) {
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
      .then(async (response) => {
        const body = (await response.json()) as ProjectEntry & {
          error?: string
        }
        if (!response.ok) {
          throw new Error(
            body.error ?? `文件读取失败（HTTP ${response.status}）。`
          )
        }
        setEntry(body)
      })
      .catch((failure: unknown) => {
        if (!(
          failure instanceof DOMException && failure.name === "AbortError"
        )) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [currentPath, projectId, revision])

  function openPath(path: string) {
    setLoading(true)
    setError(null)
    setCurrentPath(path)
  }

  function refresh() {
    setLoading(true)
    setError(null)
    setRevision((value) => value + 1)
  }

  const breadcrumbs = pathBreadcrumbs(entry?.path ?? currentPath)
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
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-xs text-muted-foreground">
          {breadcrumbs.map((item, index) => (
            <span
              key={item.path || "root"}
              className="flex min-w-0 items-center gap-1"
            >
              <button
                type="button"
                className="truncate rounded-sm px-1 py-0.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => openPath(item.path)}
              >
                {item.label}
              </button>
              {index < breadcrumbs.length - 1 ? <span>/</span> : null}
            </span>
          ))}
        </div>
        {downloadUrl ? (
          <Button asChild variant="ghost" size="icon-sm">
            <a href={downloadUrl} aria-label="下载原文件">
              <DownloadIcon />
            </a>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="刷新文件"
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
            <EmptyTitle>无法打开文件</EmptyTitle>
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
                      ? `${child.size.toLocaleString()} B`
                      : child.type}
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
              <EmptyTitle>目录为空</EmptyTitle>
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
              <EmptyTitle>无法预览</EmptyTitle>
              <EmptyDescription>
                {entry.previewUnavailable === "binary"
                  ? "这是二进制文件，可下载原文件。"
                  : "文件超过 1 MiB，可下载原文件。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      ) : null}
    </div>
  )
}
