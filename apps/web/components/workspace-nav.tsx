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
import { useParams, usePathname, useRouter } from "next/navigation"
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
import { AppUpdateButton } from "@/components/app-update-button"
import { PiBrand } from "@/components/pi-brand"
import { useI18n } from "@/components/i18n-provider"
import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts-provider"
import { useSessionIndicators } from "@/hooks/use-session-indicators"
import { useSessionPage } from "@/hooks/use-session-page"
import type { ShortcutCommandId } from "@/lib/keyboard-shortcuts"
import { useProjectPicker } from "@/components/project-picker-provider"
import { responseJson } from "@/lib/api-response"
import type {
  SessionPage,
  SessionSummary,
  WorkspaceProject,
} from "@/lib/session-types"
import {
  isWorkspaceNavItemVisible,
  workspaceNavFocusTarget,
  type WorkspaceNavFocusTarget,
  type WorkspaceSessionMutationFocusRequest,
} from "@/lib/workspace-nav-focus"
import {
  moveWorkspaceNavItems,
  type WorkspaceNavOrderMutation,
} from "@/lib/workspace-nav-order"
import { SESSION_CATALOG_CHANGED } from "@/lib/session-catalog-events"
import {
  defaultWorkspaceNavState,
  readWorkspaceNavState,
  SIDEBAR_PAGE_SIZE,
  writeWorkspaceNavState,
  type WorkspaceNavPersistedState,
} from "@/lib/workspace-nav-persistence"

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
  tasks: initialTasks,
  pinned: initialPinned,
  initialRunningSessionIds,
  mutationToken,
}: {
  projects: WorkspaceProject[]
  tasks: SessionPage
  pinned: SessionPage
  initialRunningSessionIds: string[]
  mutationToken: string
}) {
  const pathname = usePathname()
  const pickWorkspaceProject = useProjectPicker()
  const router = useRouter()
  const { t } = useI18n()
  const { ariaBindings, formattedBindings } = useKeyboardShortcuts()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const navigationHidden = !isMobile && state === "collapsed"
  const sidebarContentRef = useRef<HTMLDivElement>(null)
  const addingProjectRef = useRef(false)
  const orderQueueRef = useRef(Promise.resolve())
  const [navState, setNavState] = useState<WorkspaceNavPersistedState>(() =>
    defaultWorkspaceNavState()
  )
  const [persistenceReady, setPersistenceReady] = useState(false)
  const [orderedProjects, setOrderedProjects] = useState(projects)
  const projectList = orderedProjects
  const taskPage = useSessionPage({
    scope: "tasks",
    initialPage: initialTasks,
    enabled: persistenceReady && navState.tasksOpen,
    sidebar: true,
  })
  const pinnedPage = useSessionPage({
    scope: "pinned",
    initialPage: initialPinned,
    enabled: persistenceReady,
    sidebar: true,
  })
  const {
    sessions: tasks,
    loading: tasksLoading,
    error: tasksError,
    hasMore: tasksHasMore,
    loadMore: loadTasksMore,
  } = taskPage
  const {
    sessions: pinnedSessions,
    loading: pinnedLoading,
    error: pinnedError,
    hasMore: pinnedHasMore,
    loadMore: loadPinnedMore,
  } = pinnedPage
  const [loadedProjectSessions, setLoadedProjectSessions] = useState<
    Record<string, SessionSummary[]>
  >({})
  const onProjectSessions = useCallback(
    (projectId: string, sessions: SessionSummary[]) => {
      setLoadedProjectSessions((current) =>
        current[projectId] === sessions
          ? current
          : { ...current, [projectId]: sessions }
      )
    },
    []
  )
  const [addingProject, setAddingProject] = useState(false)
  const [shortcutState, setShortcutState] =
    useState<ConversationShortcutState | null>(null)
  const pendingFocusRef = useRef<WorkspaceNavFocusTarget | null>(null)
  const [focusRevision, setFocusRevision] = useState(0)
  useEffect(() => {
    setOrderedProjects(projects)
  }, [projects])

  useEffect(() => {
    const result = readWorkspaceNavState()
    if (result.error) toast.error(t("workspace.nav.persistenceReadFailed"))
    setNavState(result.state)
    setPersistenceReady(true)
  }, [t])

  useEffect(() => {
    if (!persistenceReady) return
    const result = writeWorkspaceNavState(navState)
    if (result.error) toast.error(t("workspace.nav.persistenceWriteFailed"))
  }, [navState, persistenceReady, t])
  const allSessions = useMemo(
    () => [
      ...new Map(
        [
          ...projectList.flatMap(
            (project) => loadedProjectSessions[project.id] ?? project.sessions
          ),
          ...tasks,
          ...pinnedSessions,
        ].map((session) => [session.id, session])
      ).values(),
    ],
    [projectList, tasks, pinnedSessions, loadedProjectSessions]
  )
  const { sessionId: activeSessionId = null } = useParams<{
    sessionId?: string
  }>()
  const { runningSessionIds, unreadSessionIds } = useSessionIndicators({
    sessions: allSessions,
    activeSessionId,
    initialRunningSessionIds,
    mutationToken,
  })
  const unpinnedTasks = tasks.filter((task) => !task.isPinned)
  const visiblePinnedSessions = pinnedSessions.slice(
    0,
    navState.pinnedVisibleCount
  )
  const visibleTasks = unpinnedTasks.slice(0, navState.tasksVisibleCount)
  const activeProject = projectList.find((project) =>
    pathname.startsWith(`/projects/${project.id}`)
  )
  const visibleProjects = projectList.slice(0, navState.projectsVisibleCount)

  useEffect(() => {
    if (
      !persistenceReady ||
      !navState.tasksOpen ||
      tasksLoading ||
      tasksError ||
      unpinnedTasks.length >= navState.tasksVisibleCount ||
      !tasksHasMore
    ) {
      return
    }
    void loadTasksMore()
  }, [
    navState.tasksOpen,
    navState.tasksVisibleCount,
    persistenceReady,
    loadTasksMore,
    tasksError,
    tasksHasMore,
    tasksLoading,
    unpinnedTasks.length,
  ])

  useEffect(() => {
    if (
      !persistenceReady ||
      pinnedLoading ||
      pinnedError ||
      pinnedSessions.length >= navState.pinnedVisibleCount ||
      !pinnedHasMore
    ) {
      return
    }
    void loadPinnedMore()
  }, [
    navState.pinnedVisibleCount,
    persistenceReady,
    loadPinnedMore,
    pinnedError,
    pinnedHasMore,
    pinnedLoading,
    pinnedSessions.length,
  ])
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
    if (isMobile) setOpenMobile(false)
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

  const requestOrder = useCallback(
    (mutation: WorkspaceNavOrderMutation) => {
      const run = async () => {
        try {
          await responseJson(
            await fetch("/api/v1/workspace-nav/order", {
              method: "POST",
              headers: {
                "X-Pi-Web-Codex-Mutation-Token": mutationToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(mutation),
            })
          )
          if (mutation.scope === "projects") {
            setOrderedProjects((current) => {
              const sourceProject = current.find(
                (project) => project.id === mutation.itemId
              )
              if (!sourceProject) return current
              const bucket = current.filter(
                (project) => project.isPinned === sourceProject.isPinned
              )
              const reordered = moveWorkspaceNavItems(bucket, mutation)
              let index = 0
              return current.map((project) => {
                if (project.isPinned !== sourceProject.isPinned) return project
                const replacement = reordered[index++]
                return replacement ?? project
              })
            })
          } else {
            window.dispatchEvent(
              new CustomEvent(SESSION_CATALOG_CHANGED, {
                detail: {
                  scope: mutation.scope,
                  projectId: mutation.projectId,
                },
              })
            )
          }
        } catch (failure) {
          toast.error(
            failure instanceof Error ? failure.message : String(failure)
          )
        }
      }
      orderQueueRef.current = orderQueueRef.current.then(run, run)
    },
    [mutationToken]
  )

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
                aria-label="pi-web-codex"
                className="rounded-md px-1 py-1 transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <PiBrand />
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

            {pinnedSessions.length > 0 || pinnedError ? (
              <SidebarGroup className="py-1">
                <SidebarGroupLabel>
                  {t("workspace.nav.pinned")}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visiblePinnedSessions.map((session) => (
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
                        orderScope="pinned"
                        orderItems={visiblePinnedSessions.map(
                          (item) => item.id
                        )}
                        onOrderRequest={requestOrder}
                      />
                    ))}
                    {pinnedError ? (
                      <li className="px-2 py-1 text-xs text-destructive">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => void loadPinnedMore()}
                        >
                          {pinnedError} · {t("app.error.retry")}
                        </button>
                      </li>
                    ) : null}
                    {pinnedHasMore ||
                    pinnedSessions.length > navState.pinnedVisibleCount ? (
                      <li>
                        <SidebarMenuButton
                          type="button"
                          className="text-muted-foreground"
                          disabled={pinnedLoading}
                          onClick={() => {
                            const next =
                              navState.pinnedVisibleCount + SIDEBAR_PAGE_SIZE
                            setNavState((current) => ({
                              ...current,
                              pinnedVisibleCount: next,
                            }))
                            if (pinnedSessions.length < next) {
                              void loadPinnedMore()
                            }
                          }}
                        >
                          <ChevronRightIcon />
                          <span>{t("workspace.nav.expandConversations")}</span>
                        </SidebarMenuButton>
                      </li>
                    ) : null}
                    {navState.pinnedVisibleCount > SIDEBAR_PAGE_SIZE ? (
                      <li>
                        <SidebarMenuButton
                          type="button"
                          className="text-muted-foreground"
                          onClick={() =>
                            setNavState((current) => ({
                              ...current,
                              pinnedVisibleCount: SIDEBAR_PAGE_SIZE,
                            }))
                          }
                        >
                          <ChevronDownIcon />
                          <span>
                            {t("workspace.nav.collapseConversations")}
                          </span>
                        </SidebarMenuButton>
                      </li>
                    ) : null}
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
                      key={project.id}
                      project={project}
                      mutationToken={mutationToken}
                      runningSessionIds={runningSessionIds}
                      unreadSessionIds={unreadSessionIds}
                      activeSessionId={activeSessionId}
                      conversationShortcuts={conversationShortcuts}
                      open={
                        navState.projectOpen[project.id] ??
                        activeProject?.id === project.id
                      }
                      persistenceReady={persistenceReady}
                      sessionVisibleCount={
                        navState.projectSessionVisibleCounts[project.id] ??
                        SIDEBAR_PAGE_SIZE
                      }
                      onOpenChange={(open) =>
                        setNavState((current) => ({
                          ...current,
                          projectOpen: {
                            ...current.projectOpen,
                            [project.id]: open,
                          },
                        }))
                      }
                      onSessionVisibleCountChange={(count) =>
                        setNavState((current) => ({
                          ...current,
                          projectSessionVisibleCounts: {
                            ...current.projectSessionVisibleCounts,
                            [project.id]: count,
                          },
                        }))
                      }
                      projectOrderItems={projectList.map((item) => ({
                        id: item.id,
                        isPinned: item.isPinned,
                      }))}
                      onOrderRequest={requestOrder}
                      onSessionMutationFocus={requestSessionMutationFocus}
                      onSessionsLoaded={onProjectSessions}
                    />
                  ))}
                  {projectList.length > navState.projectsVisibleCount ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        type="button"
                        className="text-muted-foreground"
                        onClick={() =>
                          setNavState((current) => ({
                            ...current,
                            projectsVisibleCount:
                              current.projectsVisibleCount + SIDEBAR_PAGE_SIZE,
                          }))
                        }
                      >
                        <ChevronRightIcon />
                        <span>{t("workspace.nav.expandProjects")}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {navState.projectsVisibleCount > SIDEBAR_PAGE_SIZE ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        type="button"
                        className="text-muted-foreground"
                        onClick={() =>
                          setNavState((current) => ({
                            ...current,
                            projectsVisibleCount: SIDEBAR_PAGE_SIZE,
                          }))
                        }
                      >
                        <ChevronDownIcon />
                        <span>{t("workspace.nav.collapseProjects")}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {unpinnedTasks.length > 0 ? (
              <Collapsible
                open={navState.tasksOpen}
                onOpenChange={(open) =>
                  setNavState((current) => ({ ...current, tasksOpen: open }))
                }
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
                        {visibleTasks.map((task) => (
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
                            orderScope="tasks"
                            orderItems={visibleTasks.map((item) => item.id)}
                            onOrderRequest={requestOrder}
                          />
                        ))}
                        {tasksError ? (
                          <li className="px-2 py-1 text-xs text-destructive">
                            <button
                              type="button"
                              className="underline"
                              onClick={() => void loadTasksMore()}
                            >
                              {tasksError} · {t("app.error.retry")}
                            </button>
                          </li>
                        ) : null}
                        {tasksHasMore ||
                        unpinnedTasks.length > navState.tasksVisibleCount ? (
                          <li>
                            <SidebarMenuButton
                              type="button"
                              className="text-muted-foreground"
                              disabled={tasksLoading}
                              onClick={() => {
                                const next =
                                  navState.tasksVisibleCount + SIDEBAR_PAGE_SIZE
                                setNavState((current) => ({
                                  ...current,
                                  tasksVisibleCount: next,
                                }))
                                if (unpinnedTasks.length < next) {
                                  void loadTasksMore()
                                }
                              }}
                            >
                              <ChevronRightIcon />
                              <span>
                                {t("workspace.nav.expandConversations")}
                              </span>
                            </SidebarMenuButton>
                          </li>
                        ) : null}
                        {navState.tasksVisibleCount > SIDEBAR_PAGE_SIZE ? (
                          <li>
                            <SidebarMenuButton
                              type="button"
                              className="text-muted-foreground"
                              onClick={() =>
                                setNavState((current) => ({
                                  ...current,
                                  tasksVisibleCount: SIDEBAR_PAGE_SIZE,
                                }))
                              }
                            >
                              <ChevronDownIcon />
                              <span>
                                {t("workspace.nav.collapseConversations")}
                              </span>
                            </SidebarMenuButton>
                          </li>
                        ) : null}
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
              <AppUpdateButton />
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={t("workspace.nav.settings")}
                >
                  <Link prefetch={false} href="/settings/general">
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
