import type { CSSProperties } from "react"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { WorkspaceNav } from "@/components/workspace-nav"
import { listWorkspaceProjects, listWorkspaceTasks } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [projects, tasks] = await Promise.all([
    listWorkspaceProjects(),
    listWorkspaceTasks(),
  ])
  const runtimeSupervisor = getRuntimeSupervisor()
  const initialRunningSessionIds = [
    ...projects.flatMap((project) => project.sessions),
    ...tasks,
  ]
    .filter((session) => runtimeSupervisor.state(session.id).status === "busy")
    .map((session) => session.id)

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "var(--app-sidebar-width)",
        } as CSSProperties
      }
    >
      <WorkspaceNav
        projects={projects}
        tasks={tasks}
        initialRunningSessionIds={initialRunningSessionIds}
        mutationToken={getMutationToken()}
      />
      <SidebarInset className="min-h-svh overflow-hidden">
        <header className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
          <SidebarTrigger />
          <span className="ml-2 font-medium">pi-web-codex</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
