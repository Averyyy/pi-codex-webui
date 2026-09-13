import { notFound } from "next/navigation"

import { NewSessionButton } from "@/components/new-session-button"
import { ProjectHeader } from "@/components/project-header"
import { ProjectSessionList } from "@/components/project-session-list"
import { getProject, listSessionPage } from "@/lib/catalog"
import { getLocalizedConfig } from "@/lib/i18n-server"
import { readProjectGitStatus } from "@/lib/project-git"

export default async function ProjectPage({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params
  const [{ config }, project, page] = await Promise.all([
    getLocalizedConfig(),
    getProject(projectId),
    listSessionPage({ scope: "project", projectId }),
  ])
  if (!project) notFound()
  const git = await readProjectGitStatus(project.path)
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
      <ProjectSessionList projectId={projectId} initialPage={page} />
    </div>
  )
}
