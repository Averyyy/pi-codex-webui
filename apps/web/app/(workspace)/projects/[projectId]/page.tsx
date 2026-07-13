import Link from "next/link"
import { notFound } from "next/navigation"
import { MessageSquareTextIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { NewSessionButton } from "@/components/new-session-button"
import { ProjectHeader } from "@/components/project-header"
import { getProject, listProjectSessions } from "@/lib/catalog"
import { readProjectGitStatus } from "@/lib/project-git"
import { getMutationToken } from "@/lib/request-security"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params
  const [project, sessions] = await Promise.all([
    getProject(projectId),
    listProjectSessions(projectId),
  ])
  if (!project) notFound()
  const git = await readProjectGitStatus(project.path)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-14">
      <ProjectHeader
        project={project}
        branch={git.available ? git.branch : null}
      >
        <NewSessionButton
          projectId={projectId}
          mutationToken={getMutationToken()}
        />
      </ProjectHeader>

      <section className="grid gap-3">
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/projects/${projectId}/sessions/${session.id}`}
            className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="gap-3 transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="truncate">
                      {displaySessionTitle(session)}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {formatTimestamp(session.updatedAt)}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    <MessageSquareTextIcon />
                    {session.messageCount}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>
    </main>
  )
}
