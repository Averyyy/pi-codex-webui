"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronRightIcon,
  FolderGit2Icon,
  HomeIcon,
  ListTodoIcon,
  PlusIcon,
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
import type { SessionSummary, WorkspaceProject } from "@/lib/session-types"

const VISIBLE_PROJECT_SESSIONS = 5

export function WorkspaceNav({
  projects,
  tasks,
}: {
  projects: WorkspaceProject[]
  tasks: SessionSummary[]
}) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3 px-3 pt-3">
        <Link
          href="/"
          className="flex h-9 items-center px-1 text-base font-semibold tracking-tight"
        >
          pi-web-codex
        </Link>
        <form action="/search" className="relative">
          <Input
            name="q"
            type="search"
            placeholder="搜索对话"
            aria-label="搜索对话"
            className="h-8 bg-background pr-8 shadow-none"
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
        <SidebarGroup className="pb-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="font-medium">
                  <Link href="/new">
                    <PlusIcon />
                    <span>新对话</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link href="/">
                    <HomeIcon />
                    <span>概览</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {tasks.length ? (
          <SidebarGroup className="pt-1">
            <SidebarGroupLabel>任务</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {tasks.map((task) => {
                  const href = `/tasks/${task.id}`
                  return (
                    <SidebarMenuItem key={task.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === href}
                        tooltip={displaySessionTitle(task)}
                      >
                        <Link href={href} prefetch={false}>
                          <ListTodoIcon />
                          <span className="min-w-0 flex-1 truncate">
                            {displaySessionTitle(task)}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup className="pt-1">
          <SidebarGroupLabel>项目</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => {
                const projectPath = `/projects/${project.id}`
                const active = pathname.startsWith(projectPath)
                const recent = project.sessions.slice(
                  0,
                  VISIBLE_PROJECT_SESSIONS
                )
                return (
                  <Collapsible
                    key={`${project.id}:${active ? "active" : "inactive"}`}
                    asChild
                    defaultOpen={active}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={project.path}
                        >
                          <FolderGit2Icon />
                          <span className="min-w-0 flex-1 truncate">
                            {project.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {project.sessionCount}
                          </span>
                          <ChevronRightIcon className="shrink-0 transition-transform group-data-open/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {recent.map((session) => {
                            const href = `${projectPath}/sessions/${session.id}`
                            return (
                              <SidebarMenuSubItem key={session.id}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === href}
                                >
                                  <Link
                                    href={href}
                                    prefetch={false}
                                    title={displaySessionTitle(session)}
                                  >
                                    <span className="min-w-0 truncate">
                                      {displaySessionTitle(session)}
                                    </span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            )
                          })}
                          {project.sessions.length > recent.length ? (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                <Link href={projectPath}>
                                  查看全部 {project.sessionCount} 条
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ) : null}
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
