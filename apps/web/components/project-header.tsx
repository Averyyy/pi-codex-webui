import Link from "next/link"
import { FileTextIcon, FolderGit2Icon, GitBranchIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import type { ProjectSummary } from "@/lib/session-types"

export function ProjectHeader({
  project,
  branch,
  children,
}: {
  project: ProjectSummary
  branch?: string | null
  children?: React.ReactNode
}) {
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
              {project.path || "未知目录"}
            </p>
          </div>
        </div>
        {children}
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="项目工具">
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.id}`}>Sessions</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.id}/files`}>
            <FileTextIcon /> 文件
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.id}/git`}>
            <GitBranchIcon /> Git
          </Link>
        </Button>
      </nav>
    </header>
  )
}
