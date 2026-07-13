import Link from "next/link"
import { notFound } from "next/navigation"
import { FolderGit2Icon, MessageSquareTextIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getProject, listProjectSessions } from "@/lib/catalog"
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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
      <header className="flex flex-col gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-muted">
          <FolderGit2Icon className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
            {project.path || "未知目录"}
          </p>
        </div>
      </header>

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
