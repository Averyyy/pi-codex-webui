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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { NewSessionButton } from "@/components/new-session-button"
import { ProjectHeader } from "@/components/project-header"
import { getProject, listProjectSessions } from "@/lib/catalog"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { readProjectGitStatus } from "@/lib/project-git"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params
  const [{ config, t }, project, sessions] = await Promise.all([
    getLocalizedConfig(),
    getProject(projectId),
    listProjectSessions(projectId),
  ])
  if (!project) notFound()
  const git = await readProjectGitStatus(project.path)
  const sessionTitleFallback = {
    task: t("workspace.nav.newTask"),
    conversation: t("workspace.nav.unnamedConversation"),
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-14">
      <ProjectHeader
        project={project}
        branch={git.available ? git.branch : null}
        active="sessions"
        locale={config.appearance.language}
      >
        <NewSessionButton
          projectId={projectId}
          locale={config.appearance.language}
        />
      </ProjectHeader>

      <section
        className="grid gap-3"
        aria-label={t("project.sessions.ariaLabel")}
      >
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/projects/${projectId}/sessions/${session.id}`}
            className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="gap-3 transition-colors group-hover:bg-muted/50">
              <CardHeader>
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">
                      {displaySessionTitle(session, sessionTitleFallback)}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <time dateTime={session.updatedAt}>
                        {formatTimestamp(
                          session.updatedAt,
                          config.appearance.language
                        )}
                      </time>
                    </CardDescription>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0"
                    aria-label={t(
                      session.messageCount === 1
                        ? "project.sessions.messageCountOne"
                        : "project.sessions.messageCount",
                      { count: session.messageCount }
                    )}
                  >
                    <MessageSquareTextIcon />
                    {session.messageCount.toLocaleString(
                      config.appearance.language
                    )}
                  </Badge>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
        {sessions.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareTextIcon />
              </EmptyMedia>
              <EmptyTitle>{t("project.sessions.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("project.sessions.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </section>
    </div>
  )
}
