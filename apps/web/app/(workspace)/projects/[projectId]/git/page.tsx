import { notFound } from "next/navigation"
import { CheckCircle2Icon, GitBranchIcon, RefreshCwIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
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
import { readProjectGitStatus } from "@/lib/project-git"

export default async function ProjectGitPage({
  params,
}: PageProps<"/projects/[projectId]/git">) {
  const { projectId } = await params
  const project = await getProject(projectId)
  if (!project) notFound()
  const git = await readProjectGitStatus(project.path)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-14">
      <ProjectHeader
        project={project}
        branch={git.available ? git.branch : null}
      >
        <Button asChild variant="outline" size="sm">
          <a href={`/projects/${projectId}/git`}>
            <RefreshCwIcon /> 刷新状态
          </a>
        </Button>
      </ProjectHeader>

      {!git.available ? (
        <Card>
          <CardHeader>
            <CardTitle>Git 不可用</CardTitle>
            <CardDescription>{git.error}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <GitBranchIcon className="size-4" />
                {git.branch ?? "Detached HEAD"}
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
                <Badge variant="secondary">{git.upstream}</Badge>
                <span className="text-muted-foreground">
                  ahead {git.ahead} · behind {git.behind}
                </span>
              </CardContent>
            ) : null}
          </Card>

          <Card className="gap-0 overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle>工作区</CardTitle>
              <CardDescription>
                {git.files.length
                  ? `${git.files.length} 个真实 Git 状态条目。`
                  : "工作区没有未提交变更。"}
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
                            from {file.originalPath}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                  <CheckCircle2Icon className="size-4" />
                  Clean
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
