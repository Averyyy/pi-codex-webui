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
import { getLocalizedConfig } from "@/lib/i18n-server"
import {
  projectFileErrorCopy,
  projectFileTypeLabel,
} from "@/lib/project-file-display"
import {
  ProjectFileError,
  readProjectEntry,
  type ProjectFileEntry,
} from "@/lib/project-files"
import { readProjectGitStatus } from "@/lib/project-git"
import { formatTimestamp } from "@/lib/session-display"

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

function breadcrumbs(
  projectId: string,
  requestedPath: string,
  rootLabel: string
) {
  const segments = requestedPath.split("/").filter(Boolean)
  return [
    { label: rootLabel, path: "" },
    ...segments.map((label, index) => ({
      label,
      path: segments.slice(0, index + 1).join("/"),
    })),
  ].map((item, index, items) => (
    <span
      key={item.path || "root"}
      className="flex max-w-full min-w-0 items-center gap-1"
    >
      <Link
        href={entryHref(projectId, item.path)}
        className="min-w-0 truncate hover:text-foreground"
        title={item.label}
        aria-current={index === items.length - 1 ? "page" : undefined}
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
  const [{ config, t }, project] = await Promise.all([
    getLocalizedConfig(),
    getProject(projectId),
  ])
  if (!project) notFound()
  const git = await readProjectGitStatus(project.path)

  let entry: Awaited<ReturnType<typeof readProjectEntry>>
  try {
    entry = await readProjectEntry(project.path, requestedPath)
  } catch (error) {
    if (!(error instanceof ProjectFileError)) throw error
    const copy = projectFileErrorCopy(error.code, config.appearance.language)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-14">
        <ProjectHeader
          project={project}
          branch={git.available ? git.branch : null}
          active="files"
          locale={config.appearance.language}
        />
        <Card>
          <CardHeader>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
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
        active="files"
        locale={config.appearance.language}
      />

      <Card className="min-w-0 gap-0 overflow-hidden">
        <CardHeader className="border-b">
          <nav
            aria-label={t("project.files.pathAriaLabel")}
            className="flex flex-wrap items-center gap-1 font-mono text-xs text-muted-foreground"
          >
            {breadcrumbs(projectId, entry.path, t("project.files.root"))}
          </nav>
          <CardDescription>
            {t("project.files.readOnlyDescription")}
          </CardDescription>
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
                        ? `${child.size.toLocaleString(
                            config.appearance.language
                          )} B`
                        : projectFileTypeLabel(
                            child.type,
                            config.appearance.language
                          )}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {t("project.files.emptyDirectory")}
              </p>
            )}
          </CardContent>
        ) : (
          <CardContent className="grid min-w-0 gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{entry.name}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.size.toLocaleString(config.appearance.language)} B ·{" "}
                  {formatTimestamp(
                    entry.modifiedAt,
                    config.appearance.language
                  )}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/v1/projects/${projectId}/files?${new URLSearchParams(
                    { path: entry.path, download: "1" }
                  )}`}
                >
                  <DownloadIcon /> {t("project.files.download")}
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
                  ? t("project.files.binaryDescription")
                  : t("project.files.tooLargeDescription")}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
