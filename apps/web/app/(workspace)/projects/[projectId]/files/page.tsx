import Link from "next/link"
import { notFound } from "next/navigation"
import {
  DownloadIcon,
  FileIcon,
  FileQuestionIcon,
  FolderIcon,
  LinkIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { ProjectHeader } from "@/components/project-header"
import { getProject } from "@/lib/catalog"
import {
  ProjectFileError,
  readProjectEntry,
  type ProjectFileEntry,
} from "@/lib/project-files"
import { readProjectGitStatus } from "@/lib/project-git"

function fileIcon(type: ProjectFileEntry["type"]) {
  if (type === "directory") return <FolderIcon className="size-4" />
  if (type === "symbolic-link") return <LinkIcon className="size-4" />
  if (type === "file") return <FileIcon className="size-4" />
  return <FileQuestionIcon className="size-4" />
}

function entryHref(projectId: string, entryPath: string) {
  const query = new URLSearchParams({ path: entryPath })
  return `/projects/${projectId}/files?${query}`
}

function breadcrumbs(projectId: string, requestedPath: string) {
  const segments = requestedPath.split("/").filter(Boolean)
  return [
    { label: "root", path: "" },
    ...segments.map((label, index) => ({
      label,
      path: segments.slice(0, index + 1).join("/"),
    })),
  ].map((item, index, items) => (
    <span key={item.path || "root"} className="flex min-w-0 items-center gap-1">
      <Link
        href={entryHref(projectId, item.path)}
        className="truncate hover:text-foreground"
      >
        {item.label}
      </Link>
      {index < items.length - 1 ? <span>/</span> : null}
    </span>
  ))
}

export default async function ProjectFilesPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/files">) {
  const { projectId } = await params
  const query = await searchParams
  const requestedPath = typeof query.path === "string" ? query.path : ""
  const project = await getProject(projectId)
  if (!project) notFound()
  const git = await readProjectGitStatus(project.path)

  let entry: Awaited<ReturnType<typeof readProjectEntry>>
  try {
    entry = await readProjectEntry(project.path, requestedPath)
  } catch (error) {
    if (!(error instanceof ProjectFileError)) throw error
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-14">
        <ProjectHeader
          project={project}
          branch={git.available ? git.branch : null}
        />
        <Card>
          <CardHeader>
            <CardTitle>无法打开路径</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-14">
      <ProjectHeader
        project={project}
        branch={git.available ? git.branch : null}
      />

      <Card className="min-w-0 gap-0 overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground">
            {breadcrumbs(projectId, entry.path)}
          </div>
          <CardDescription>只读浏览真实项目目录。</CardDescription>
        </CardHeader>
        {entry.kind === "directory" ? (
          <CardContent className="p-0">
            {entry.entries.length ? (
              <div className="divide-y">
                {entry.entries.map((child) => (
                  <Link
                    key={child.name}
                    href={entryHref(projectId, child.path)}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:px-6"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="text-muted-foreground">
                        {fileIcon(child.type)}
                      </span>
                      <span className="truncate">{child.name}</span>
                    </span>
                    <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">
                      {child.type === "file"
                        ? `${child.size.toLocaleString()} B`
                        : child.type}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">目录为空。</p>
            )}
          </CardContent>
        ) : (
          <CardContent className="grid min-w-0 gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{entry.name}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.size.toLocaleString()} B · {entry.modifiedAt}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/v1/projects/${projectId}/files?${new URLSearchParams(
                    { path: entry.path, download: "1" }
                  )}`}
                >
                  <DownloadIcon /> 下载原文件
                </a>
              </Button>
            </div>
            {entry.preview !== null ? (
              <pre className="max-h-[65svh] overflow-auto rounded-lg border bg-muted/30 p-4 font-mono text-xs leading-5 whitespace-pre">
                {entry.preview}
              </pre>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {entry.previewUnavailable === "binary"
                  ? "这是二进制文件；可下载原文件。"
                  : "文件超过 1 MiB；可下载原文件。"}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
