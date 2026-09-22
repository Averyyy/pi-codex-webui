import type { CSSProperties } from "react"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { WorkspaceNav } from "@/components/workspace-nav"
import { PiBrand } from "@/components/pi-brand"
import { SidebarShortcut } from "@/components/sidebar-shortcut"
import { listWorkspaceProjects, listSessionPage } from "@/lib/catalog"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { SIDEBAR_PAGE_SIZE } from "@/lib/workspace-nav-persistence"

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [projects, tasks, pinned] = await Promise.all([
    listWorkspaceProjects(),
    listSessionPage({
      scope: "tasks",
      order: "sidebar",
      limit: SIDEBAR_PAGE_SIZE,
    }),
    listSessionPage({
      scope: "pinned",
      order: "sidebar",
      limit: SIDEBAR_PAGE_SIZE,
    }),
  ])
  const runtimeSupervisor = getRuntimeSupervisor()
  const initialRunningSessionIds = [
    ...projects.flatMap((project) => project.sessions),
    ...tasks.sessions,
    ...pinned.sessions,
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
      <SidebarShortcut />
      <WorkspaceNav
        projects={projects}
        tasks={tasks}
        pinned={pinned}
        initialRunningSessionIds={initialRunningSessionIds}
        mutationToken={getMutationToken()}
      />
      <SidebarInset
        id="main-content"
        tabIndex={-1}
        className="min-h-svh overflow-hidden"
      >
        <header className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
          <SidebarTrigger />
          <PiBrand className="ml-2" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
