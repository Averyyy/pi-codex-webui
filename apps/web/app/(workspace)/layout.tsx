import type { CSSProperties } from "react"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { WorkspaceNav } from "@/components/workspace-nav"
import { listWorkspaceProjects } from "@/lib/catalog"

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "var(--app-sidebar-width)",
        } as CSSProperties
      }
    >
      <WorkspaceNav projects={await listWorkspaceProjects()} />
      <SidebarInset className="min-h-svh">
        <header className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
          <SidebarTrigger />
          <span className="ml-2 font-medium">pi-web-codex</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
