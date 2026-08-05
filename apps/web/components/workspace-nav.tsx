"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react"
import { toast } from "sonner"

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
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { WorkspaceNavProject } from "@/components/workspace-nav-project"
import { WorkspaceNavSession } from "@/components/workspace-nav-session"
import { useI18n } from "@/components/i18n-provider"
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts-provider"
import { useSessionIndicators } from "@/hooks/use-session-indicators"
import type { ShortcutCommandId } from "@/lib/keyboard-shortcuts"
import { pickWorkspaceProject } from "@/lib/project-picker-client"
import type { SessionSummary, WorkspaceProject } from "@/lib/session-types"
import {
  isWorkspaceNavItemVisible,
  workspaceNavFocusTarget,
  type WorkspaceNavFocusTarget,
  type WorkspaceSessionMutationFocusRequest,
} from "@/lib/workspace-nav-focus"

const COLLAPSED_PROJECT_COUNT = 4
const MAX_CONVERSATION_SHORTCUTS = 9

interface ConversationShortcutState {
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
  initialRunningSessionIds,
  mutationToken,
}: {
  projects: WorkspaceProject[]
  tasks: SessionSummary[]
  initialRunningSessionIds: string[]
  mutationToken: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()
  const { ariaBindings, formattedBindings } = useKeyboardShortcuts()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const navigationHidden = !isMobile && state === "collapsed"
  const sidebarContentRef = useRef<HTMLDivElement>(null)
  const addingProjectRef = useRef(false)
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(pathname.startsWith("/tasks/"))
  const [addingProject, setAddingProject] = useState(false)
  const [shortcutState, setShortcutState] =
    useState<ConversationShortcutState | null>(null)
  const pendingFocusRef = useRef<WorkspaceNavFocusTarget | null>(null)
  const [focusRevision, setFocusRevision] = useState(0)
  const allSessions = useMemo(
    () => [...projects.flatMap((project) => project.sessions), ...tasks],
    [projects, tasks]
  )
  const sessionIdsByHref = useMemo(
    () =>
      new Map(allSessions.map((session) => [sessionHref(session), session.id])),
    [allSessions]
  )
  const activeSessionId = sessionIdsByHref.get(pathname) ?? null
  const { runningSessionIds, unreadSessionIds } = useSessionIndicators({
    sessions: allSessions,
    activeSessionId,
    initialRunningSessionIds,
    mutationToken,
  })
  const pinnedSessions = useMemo(
    () =>
      [...projects.flatMap((project) => project.sessions), ...tasks]
        .filter((session) => session.isPinned)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [projects, tasks]
  )
  const unpinnedTasks = tasks.filter((task) => !task.isPinned)
  const collapsedProjects = projects.slice(0, COLLAPSED_PROJECT_COUNT)
  const activeProject = projects.find((project) =>
    pathname.startsWith(`/projects/${project.id}`)
  )
  const visibleProjects = projectsExpanded
    ? projects
    : activeProject &&
        !collapsedProjects.some((project) => project.id === activeProject.id)
      ? [...collapsedProjects, activeProject]
      : collapsedProjects
  const tasksVisible = tasksOpen || pathname.startsWith("/tasks/")
  const conversationShortcuts = useMemo(
    () =>
      new Map(
        shortcutState?.hrefs.map((href, index) => {
          const commandId =
            `navigation.conversation${index + 1}` as ShortcutCommandId
          return [
            href,
            {
              label: formattedBindings(commandId)[0] ?? "",
              aria: ariaBindings(commandId),
            },
          ] as const
        }) ?? []
      ),
    [ariaBindings, formattedBindings, shortcutState]
  )

  const visibleConversationHrefs = useCallback(
    () =>
      Array.from(
        sidebarContentRef.current?.querySelectorAll<HTMLAnchorElement>(
          "a[data-conversation-shortcut]"
        ) ?? []
      )
        .filter(isWorkspaceNavItemVisible)
        .map((link) => link.dataset.conversationShortcut!),
    []
  )

  const requestSessionMutationFocus = useCallback(
    (request: WorkspaceSessionMutationFocusRequest) => {
      pendingFocusRef.current = workspaceNavFocusTarget(
        request,
        visibleConversationHrefs()
      )
      setFocusRevision((revision) => revision + 1)
    },
    [visibleConversationHrefs]
  )

  useLayoutEffect(() => {
    const target = pendingFocusRef.current
    if (!target) return

    let focusElement: HTMLElement | null = null
    if (target.kind === "pin") {
      const session = allSessions.find(
        (candidate) => candidate.id === target.sessionId
      )
      if (!session || session.isPinned !== target.pinned) return

      focusElement =
        Array.from(
          sidebarContentRef.current?.querySelectorAll<HTMLButtonElement>(
            "button[data-session-pin]"
          ) ?? []
        ).find(
          (button) =>
            button.dataset.sessionPin === target.sessionId &&
            button.dataset.pinned === String(target.pinned) &&
            isWorkspaceNavItemVisible(button)
        ) ?? null

      if (!focusElement && !target.pinned) {
        if (target.projectId === null) {
          focusElement =
            sidebarContentRef.current?.querySelector<HTMLElement>(
              "[data-workspace-tasks-trigger]"
            ) ?? null
        } else {
          focusElement =
            Array.from(
              sidebarContentRef.current?.querySelectorAll<HTMLAnchorElement>(
                "a[data-project-link]"
              ) ?? []
            ).find((link) => link.dataset.projectLink === target.projectId) ??
            null
        }
      }
    } else if (target.kind === "session") {
      if (
        allSessions.some((session) => session.id === target.archivedSessionId)
      ) {
        return
      }
      focusElement =
        Array.from(
          sidebarContentRef.current?.querySelectorAll<HTMLAnchorElement>(
            "a[data-conversation-shortcut]"
          ) ?? []
        ).find(
          (link) =>
            link.dataset.conversationShortcut === target.href &&
            isWorkspaceNavItemVisible(link)
        ) ?? null
    } else {
      if (
        allSessions.some((session) => session.id === target.archivedSessionId)
      ) {
        return
      }
      focusElement =
        sidebarContentRef.current?.querySelector<HTMLElement>(
          "[data-workspace-new-conversation]"
        ) ?? null
    }

    if (!focusElement) {
      focusElement =
        sidebarContentRef.current?.querySelector<HTMLElement>(
          "[data-workspace-new-conversation]"
        ) ?? null
    }
    if (!focusElement) return

    focusElement.focus()
    pendingFocusRef.current = null
  }, [allSessions, focusRevision])

  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, pathname, setOpenMobile])

  useEffect(() => {
    function showShortcuts() {
      setShortcutState({
        hrefs: visibleConversationHrefs().slice(0, MAX_CONVERSATION_SHORTCUTS),
      })
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Meta" || event.key === "Control") {
        if (!event.repeat) showShortcuts()
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Meta") {
        if (event.ctrlKey) showShortcuts()
        else setShortcutState(null)
      } else if (event.key === "Control") {
        if (event.metaKey) showShortcuts()
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
  }, [visibleConversationHrefs])

  async function addProject() {
    if (addingProjectRef.current) return
    addingProjectRef.current = true
    setAddingProject(true)
    try {
      if (await pickWorkspaceProject(mutationToken)) router.refresh()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      addingProjectRef.current = false
      setAddingProject(false)
    }
  }

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <nav
          aria-label={t("workspace.nav.ariaLabel")}
          className="flex size-full min-h-0 flex-col"
          onClickCapture={(event) => {
            if (
              isMobile &&
              event.target instanceof Element &&
              event.target.closest("a[href]")
            ) {
              setOpenMobile(false)
            }
          }}
        >
          <SidebarHeader
            className="px-3 pt-3"
            inert={navigationHidden}
            aria-hidden={navigationHidden}
          >
            <div className="flex h-9 items-center justify-between">
              <Link
                href="/"
                className="px-1 text-base font-semibold tracking-tight"
              >
                pi-web-codex
              </Link>
              <Button asChild variant="ghost" size="icon-sm">
                <Link
                  href="/search"
                  aria-label={t("workspace.nav.search")}
                  aria-current={pathname === "/search" ? "page" : undefined}
                >
                  <SearchIcon />
                </Link>
              </Button>
            </div>
          </SidebarHeader>

          <SidebarContent
            ref={sidebarContentRef}
            inert={navigationHidden}
            aria-hidden={navigationHidden}
          >
            <SidebarGroup className="pb-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="font-medium"
                      isActive={pathname === "/" || pathname === "/new"}
                    >
                      <Link
                        href="/"
                        data-workspace-new-conversation
                        aria-current={
                          pathname === "/" || pathname === "/new"
                            ? "page"
                            : undefined
                        }
                      >
                        <PlusIcon />
                        <span>{t("workspace.nav.newConversation")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {pinnedSessions.length > 0 ? (
              <SidebarGroup className="py-1">
                <SidebarGroupLabel>
                  {t("workspace.nav.pinned")}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {pinnedSessions.map((session) => (
                      <WorkspaceNavSession
                        key={session.id}
                        session={session}
                        href={sessionHref(session)}
                        mutationToken={mutationToken}
                        running={runningSessionIds.has(session.id)}
                        unread={
                          session.id !== activeSessionId &&
                          unreadSessionIds.has(session.id)
                        }
                        shortcut={conversationShortcuts.get(
                          sessionHref(session)
                        )}
                        onMutationFocus={requestSessionMutationFocus}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}

            <SidebarGroup className="py-1">
              <SidebarGroupLabel>
                {t("workspace.nav.projects")}
              </SidebarGroupLabel>
              <SidebarGroupAction
                data-shortcut-open-folder
                type="button"
                aria-label={
                  addingProject
                    ? t("workspace.nav.choosingProject")
                    : t("workspace.nav.addProject")
                }
                disabled={addingProject}
                aria-busy={addingProject}
                onClick={() => void addProject()}
              >
                {addingProject ? (
                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <PlusIcon />
                )}
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleProjects.map((project) => (
                    <WorkspaceNavProject
                      key={`${project.id}:${pathname.startsWith(`/projects/${project.id}`) ? "active" : "inactive"}`}
                      project={project}
                      mutationToken={mutationToken}
                      runningSessionIds={runningSessionIds}
                      unreadSessionIds={unreadSessionIds}
                      activeSessionId={activeSessionId}
                      conversationShortcuts={conversationShortcuts}
                      onSessionMutationFocus={requestSessionMutationFocus}
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
                        <span>
                          {projectsExpanded
                            ? t("workspace.nav.collapseProjects")
                            : t("workspace.nav.expandProjects")}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {unpinnedTasks.length > 0 ? (
              <Collapsible
                open={tasksVisible}
                onOpenChange={setTasksOpen}
                asChild
              >
                <SidebarGroup className="py-1">
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger
                      className="group/tasks w-full cursor-pointer justify-between hover:bg-sidebar-accent"
                      data-workspace-tasks-trigger
                    >
                      <span>{t("workspace.nav.tasks")}</span>
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
                            running={runningSessionIds.has(task.id)}
                            unread={
                              task.id !== activeSessionId &&
                              unreadSessionIds.has(task.id)
                            }
                            shortcut={conversationShortcuts.get(
                              `/tasks/${task.id}`
                            )}
                            onMutationFocus={requestSessionMutationFocus}
                          />
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            ) : null}
          </SidebarContent>

          <SidebarFooter
            inert={navigationHidden}
            aria-hidden={navigationHidden}
          >
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={t("workspace.nav.settings")}
                >
                  <Link href="/settings/general">
                    <SettingsIcon />
                    <span>{t("workspace.nav.settings")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </nav>
      </Sidebar>
    </>
  )
}
