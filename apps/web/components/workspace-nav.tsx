"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { AddProjectDialog } from "@/components/add-project-dialog"
import { WorkspaceNavProject } from "@/components/workspace-nav-project"
import { WorkspaceNavSession } from "@/components/workspace-nav-session"
import type { SessionSummary, WorkspaceProject } from "@/lib/session-types"

const COLLAPSED_PROJECT_COUNT = 4

function sessionHref(session: SessionSummary) {
  return session.projectId === null
    ? `/tasks/${session.id}`
    : `/projects/${session.projectId}/sessions/${session.id}`
}

export function WorkspaceNav({
  projects,
  tasks,
  mutationToken,
}: {
  projects: WorkspaceProject[]
  tasks: SessionSummary[]
  mutationToken: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(pathname.startsWith("/tasks/"))
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const pinnedSessions = useMemo(
    () =>
      [...projects.flatMap((project) => project.sessions), ...tasks]
        .filter((session) => session.isPinned)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [projects, tasks]
  )
  const unpinnedTasks = tasks.filter((task) => !task.isPinned)
  const visibleProjects = projectsExpanded
    ? projects
    : projects.slice(0, COLLAPSED_PROJECT_COUNT)

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="px-3 pt-3">
          <div className="flex h-9 items-center justify-between">
            <Link
              href="/"
              className="px-1 text-base font-semibold tracking-tight"
            >
              pi-web-codex
            </Link>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href="/search" aria-label="搜索对话">
                <SearchIcon />
              </Link>
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="pb-1">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="font-medium"
                    isActive={pathname === "/" || pathname === "/new"}
                  >
                    <Link href="/">
                      <PlusIcon />
                      <span>新对话</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {pinnedSessions.length > 0 ? (
            <SidebarGroup className="py-1">
              <SidebarGroupLabel>置顶</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pinnedSessions.map((session) => (
                    <WorkspaceNavSession
                      key={session.id}
                      session={session}
                      href={sessionHref(session)}
                      mutationToken={mutationToken}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}

          <SidebarGroup className="py-1">
            <SidebarGroupLabel>项目</SidebarGroupLabel>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarGroupAction
                  type="button"
                  aria-label="添加项目"
                  onClick={() => setAddProjectOpen(true)}
                >
                  <PlusIcon />
                </SidebarGroupAction>
              </TooltipTrigger>
              <TooltipContent side="right">添加项目</TooltipContent>
            </Tooltip>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleProjects.map((project) => (
                  <WorkspaceNavProject
                    key={`${project.id}:${pathname.startsWith(`/projects/${project.id}`) ? "active" : "inactive"}`}
                    project={project}
                    mutationToken={mutationToken}
                  />
                ))}
                {projects.length > COLLAPSED_PROJECT_COUNT ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      type="button"
                      className="text-muted-foreground"
                      onClick={() =>
                        setProjectsExpanded((expanded) => !expanded)
                      }
                    >
                      {projectsExpanded ? (
                        <ChevronDownIcon />
                      ) : (
                        <ChevronRightIcon />
                      )}
                      <span>{projectsExpanded ? "收起" : "展开显示"}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {unpinnedTasks.length > 0 ? (
            <Collapsible open={tasksOpen} onOpenChange={setTasksOpen} asChild>
              <SidebarGroup className="py-1">
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="group/tasks w-full cursor-pointer justify-between hover:bg-sidebar-accent">
                    <span>任务</span>
                    <ChevronRightIcon className="transition-transform group-data-[state=open]/tasks:rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {unpinnedTasks.map((task) => (
                        <WorkspaceNavSession
                          key={task.id}
                          session={task}
                          href={`/tasks/${task.id}`}
                          mutationToken={mutationToken}
                        />
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          ) : null}
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

      <AddProjectDialog
        open={addProjectOpen}
        onOpenChange={setAddProjectOpen}
        mutationToken={mutationToken}
        onAdded={() => router.refresh()}
      />
    </>
  )
}
