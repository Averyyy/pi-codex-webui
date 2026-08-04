import Link from "next/link"
import { FileTextIcon, FolderGit2Icon, GitBranchIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { createTranslator, type Locale } from "@/lib/i18n"
import type { ProjectSummary } from "@/lib/session-types"

export function ProjectHeader({
  project,
  branch,
  active,
  locale,
  children,
}: {
  project: ProjectSummary
  branch?: string | null
  active: "sessions" | "files" | "git"
  locale: Locale
  children?: React.ReactNode
}) {
  const t = createTranslator(locale)

  return (
    <header className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-muted">
            <FolderGit2Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {project.name}
              </h1>
              {branch ? (
                <Badge variant="outline">
                  <GitBranchIcon />
                  {branch}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
              {project.path || t("project.header.unknownDirectory")}
            </p>
          </div>
        </div>
        {children}
      </div>
      <nav
        className="flex flex-wrap gap-2"
        aria-label={t("project.tools.ariaLabel")}
      >
        <Button
          asChild
          variant={active === "sessions" ? "secondary" : "outline"}
          size="sm"
        >
          <Link
            href={`/projects/${project.id}`}
            aria-current={active === "sessions" ? "page" : undefined}
          >
            {t("project.tools.sessions")}
          </Link>
        </Button>
        <Button
          asChild
          variant={active === "files" ? "secondary" : "outline"}
          size="sm"
        >
          <Link
            href={`/projects/${project.id}/files`}
            aria-current={active === "files" ? "page" : undefined}
          >
            <FileTextIcon /> {t("project.tools.files")}
          </Link>
        </Button>
        <Button
          asChild
          variant={active === "git" ? "secondary" : "outline"}
          size="sm"
        >
          <Link
            href={`/projects/${project.id}/git`}
            aria-current={active === "git" ? "page" : undefined}
          >
            <GitBranchIcon /> {t("project.tools.git")}
          </Link>
        </Button>
      </nav>
    </header>
  )
}
