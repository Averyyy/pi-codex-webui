import { notFound } from "next/navigation"
import { CheckCircle2Icon, GitBranchIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { ProjectGitRefreshButton } from "@/components/project-git-refresh-button"
import { ProjectHeader } from "@/components/project-header"
import { getProject } from "@/lib/catalog"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { projectGitErrorCopy } from "@/lib/project-git-display"
import { readProjectGitStatus } from "@/lib/project-git"

export default async function ProjectGitPage({
  params,
}: PageProps<"/projects/[projectId]/git">) {
  const { projectId } = await params
  const [{ config, t }, project] = await Promise.all([
    getLocalizedConfig(),
    getProject(projectId),
  ])
  if (!project) notFound()
  const git = await readProjectGitStatus(project.path)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-14">
      <ProjectHeader
        project={project}
        branch={git.available ? git.branch : null}
        active="git"
        locale={config.appearance.language}
      >
        <ProjectGitRefreshButton />
      </ProjectHeader>

      {!git.available ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("project.git.unavailable")}</CardTitle>
            <CardDescription>
              {projectGitErrorCopy(git.error, config.appearance.language)}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex min-w-0 flex-wrap items-center gap-2">
                <GitBranchIcon className="size-4 shrink-0" />
                <span
                  className="max-w-full min-w-0 truncate"
                  title={git.branch ?? t("project.git.detachedHead")}
                >
                  {git.branch ?? t("project.git.detachedHead")}
                </span>
                {git.commit ? (
                  <Badge variant="outline" className="font-mono">
                    {git.commit}
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription className="font-mono break-all">
                {git.root}
              </CardDescription>
            </CardHeader>
            {git.upstream ? (
              <CardContent className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary" className="max-w-full min-w-0">
                  <span className="min-w-0 truncate" title={git.upstream}>
                    {git.upstream}
                  </span>
                </Badge>
                <span className="text-muted-foreground">
                  {t("project.git.divergence", {
                    ahead: git.ahead.toLocaleString(config.appearance.language),
                    behind: git.behind.toLocaleString(
                      config.appearance.language
                    ),
                  })}
                </span>
              </CardContent>
            ) : null}
          </Card>

          <Card className="gap-0 overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle>{t("project.git.workspace")}</CardTitle>
              <CardDescription>
                {git.files.length
                  ? t(
                      git.files.length === 1
                        ? "project.git.changedSummaryOne"
                        : "project.git.changedSummary",
                      {
                        count: git.files.length.toLocaleString(
                          config.appearance.language
                        ),
                      }
                    )
                  : t("project.git.cleanSummary")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {git.files.length ? (
                <div className="divide-y">
                  {git.files.map((file, index) => (
                    <div
                      key={`${file.path}-${index}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-sm sm:px-6"
                    >
                      <Badge variant="outline" className="font-mono">
                        {file.index === " " ? "·" : file.index}
                        {file.workingTree === " " ? "·" : file.workingTree}
                      </Badge>
                      <div className="min-w-0 font-mono text-xs break-all">
                        <p>{file.path}</p>
                        {file.originalPath ? (
                          <p className="mt-1 text-muted-foreground">
                            {t("project.git.originalPath", {
                              path: file.originalPath,
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                  <CheckCircle2Icon className="size-4" />
                  {t("project.git.clean")}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
