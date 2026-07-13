"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronRightIcon,
  FileTextIcon,
  FolderGit2Icon,
  GitBranchIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Input } from "@workspace/ui/components/input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

import { displaySessionTitle } from "@/lib/session-display"
import type { WorkspaceProject } from "@/lib/session-types"

export function WorkspaceNav({ projects }: { projects: WorkspaceProject[] }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3">
        <Link
          href="/"
          className="flex h-10 items-center px-2 text-base font-semibold"
        >
          pi-web-codex
        </Link>
        <form action="/search" className="relative">
          <Input
            name="q"
            type="search"
            placeholder="搜索 session"
            aria-label="搜索 session"
            className="h-8 pr-8"
          />
          <button
            type="submit"
            aria-label="提交搜索"
            className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <SearchIcon className="size-4" />
          </button>
        </form>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>项目</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => {
                const projectPath = `/projects/${project.id}`
                const active = pathname.startsWith(projectPath)
                return (
                  <Collapsible
                    key={project.id}
                    asChild
                    defaultOpen={active}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={project.path || project.name}
                        >
                          <FolderGit2Icon />
                          <span>{project.name}</span>
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                            {project.sessionCount}
                          </span>
                          <ChevronRightIcon className="transition-transform group-data-open/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild>
                              <Link href={projectPath}>全部 session</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `${projectPath}/files`}
                            >
                              <Link href={`${projectPath}/files`}>
                                <FileTextIcon /> 文件
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `${projectPath}/git`}
                            >
                              <Link href={`${projectPath}/git`}>
                                <GitBranchIcon /> Git
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          {project.sessions.map((session) => {
                            const href = `${projectPath}/sessions/${session.id}`
                            return (
                              <SidebarMenuSubItem key={session.id}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === href}
                                >
                                  <Link
                                    href={href}
                                    title={displaySessionTitle(session)}
                                  >
                                    <span>{displaySessionTitle(session)}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="设置">
              <Link href="/settings/general">
                <SettingsIcon />
                <span>设置</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
