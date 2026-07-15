"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
const MAX_CONVERSATION_SHORTCUTS = 9

type ShortcutModifier = "Meta" | "Control"

interface ConversationShortcutState {
  modifier: ShortcutModifier
  hrefs: string[]
}

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
  const sidebarContentRef = useRef<HTMLDivElement>(null)
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(pathname.startsWith("/tasks/"))
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [shortcutState, setShortcutState] =
    useState<ConversationShortcutState | null>(null)
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
  const conversationShortcuts = useMemo(
    () =>
      new Map(
        shortcutState?.hrefs.map((href, index) => [href, index + 1]) ?? []
      ),
    [shortcutState]
  )
  const shortcutModifier =
    shortcutState?.modifier === "Meta"
      ? "⌘"
      : shortcutState?.modifier === "Control"
        ? "Ctrl"
        : undefined

  useEffect(() => {
    function visibleConversationHrefs() {
      return Array.from(
        sidebarContentRef.current?.querySelectorAll<HTMLAnchorElement>(
          "a[data-conversation-shortcut]"
        ) ?? []
      )
        .filter((link) => link.checkVisibility())
        .slice(0, MAX_CONVERSATION_SHORTCUTS)
        .map((link) => link.dataset.conversationShortcut!)
    }

    function showShortcuts(modifier: ShortcutModifier) {
      setShortcutState({ modifier, hrefs: visibleConversationHrefs() })
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Meta" || event.key === "Control") {
        if (!event.repeat) showShortcuts(event.key)
        return
      }

      if (
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        !/^[1-9]$/.test(event.key)
      ) {
        return
      }

      const href = visibleConversationHrefs()[Number(event.key) - 1]
      if (!href) return

      event.preventDefault()
      router.push(href)
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Meta") {
        if (event.ctrlKey) showShortcuts("Control")
        else setShortcutState(null)
      } else if (event.key === "Control") {
        if (event.metaKey) showShortcuts("Meta")
        else setShortcutState(null)
      }
    }

    function hideShortcuts() {
      setShortcutState(null)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", hideShortcuts)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", hideShortcuts)
    }
  }, [router])

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

        <SidebarContent ref={sidebarContentRef}>
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
                      shortcutNumber={conversationShortcuts.get(
                        sessionHref(session)
                      )}
                      shortcutModifier={shortcutModifier}
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
                    conversationShortcuts={conversationShortcuts}
                    shortcutModifier={shortcutModifier}
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
                          shortcutNumber={conversationShortcuts.get(
                            `/tasks/${task.id}`
                          )}
                          shortcutModifier={shortcutModifier}
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
