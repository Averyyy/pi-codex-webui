"use client"

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import dynamic from "next/dynamic"
import {
  BotIcon,
  FileDiffIcon,
  FilesIcon,
  FolderOpenIcon,
  GitBranchIcon,
  PanelBottomIcon,
  PanelRightIcon,
  PlusIcon,
  SquareTerminalIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  usePanelRef,
} from "@workspace/ui/components/resizable"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { restorePendingFocus } from "@workspace/ui/lib/focus-restoration"
import { cn } from "@workspace/ui/lib/utils"

import { ShellTerminal } from "@/components/shell-terminal"
import { useShortcutAction } from "@/components/keyboard-shortcuts-provider"
import {
  SessionInspector,
  type SessionInspectorProps,
} from "@/components/session-inspector"
import { SubagentsPanel } from "@/components/subagents"
import { useI18n } from "@/components/i18n-provider"
import { responseJson } from "@/lib/api-response"
import type { ProjectGitStatus } from "@/lib/project-git"
import { shouldScrollToSessionTail } from "@/lib/session-scroll"
import type { Translator } from "@/lib/i18n"

const ProjectReviewPanel = dynamic(
  () =>
    import("@/components/project-review-panel").then(
      (module) => module.ProjectReviewPanel
    ),
  { loading: () => <Skeleton className="m-3 h-72" /> }
)

const ProjectFilesPanel = dynamic(
  () =>
    import("@/components/project-files-panel").then(
      (module) => module.ProjectFilesPanel
    ),
  { loading: () => <Skeleton className="m-3 h-72" /> }
)

type WorkspaceTab = "review" | "files" | "terminal" | "subagents"
type TerminalPlacement = "bottom" | "sidebar" | null

const TAB_ICONS: Record<WorkspaceTab, LucideIcon> = {
  review: FileDiffIcon,
  files: FilesIcon,
  terminal: SquareTerminalIcon,
  subagents: BotIcon,
}

function tabLabel(t: Translator, tab: WorkspaceTab) {
  if (tab === "review") return t("session.tab.review")
  if (tab === "files") return t("session.tab.files")
  if (tab === "terminal") return t("session.tab.terminal")
  return t("session.tab.subagents")
}

const SIDE_BY_SIDE_MIN_WIDTH = 42 * 16

function IconTooltip({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function GitHeaderStatus({
  projectId,
  initialGit,
  onOpenReview,
}: {
  projectId: string
  initialGit: ProjectGitStatus
  onOpenReview: () => void
}) {
  const { t } = useI18n()
  const [git, setGit] = useState(initialGit)

  useEffect(() => {
    let disposed = false
    const showFailure = (failure: unknown) => {
      if (disposed) return
      setGit({
        available: false,
        error: failure instanceof Error ? failure.message : String(failure),
      })
    }
    const refresh = async () => {
      const next = await responseJson<ProjectGitStatus>(
        await fetch(`/api/v1/projects/${projectId}/git`)
      )
      if (!disposed) setGit(next)
    }
    const changes = new EventSource(`/api/v1/projects/${projectId}/changes`)
    const update = () => void refresh().catch(showFailure)
    changes.addEventListener("project.change", update)
    void refresh().catch(showFailure)
    return () => {
      disposed = true
      changes.close()
    }
  }, [projectId])

  if (!git.available) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-destructive transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={t("project.git.unavailable")}
            onClick={onOpenReview}
          >
            <GitBranchIcon className="size-3.5" />
            <span className="hidden sm:inline">Git</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{git.error}</TooltipContent>
      </Tooltip>
    )
  }
  const branch = git.branch ?? t("project.git.detachedHead")
  const changed = git.files.length
  const divergence = git.upstream ? `${git.ahead}↑ ${git.behind}↓` : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("session.workspace.gitSummary", { branch })}
          className="flex max-w-[min(42vw,28rem)] min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onOpenReview}
        >
          <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <code className="min-w-0 truncate font-mono text-foreground">
            {branch}
          </code>
          <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-300">
              +{git.additions}
            </span>
            <span className="text-red-700 dark:text-red-300">
              -{git.deletions}
            </span>
          </span>
          <span className="hidden shrink-0 text-muted-foreground sm:inline">
            {changed} {t("session.workspace.gitFilesShort")}
          </span>
          {divergence ? (
            <span className="hidden shrink-0 font-mono text-muted-foreground lg:inline">
              {divergence}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="font-mono">{git.commit ?? "HEAD"}</span>
        {git.upstream ? ` · ${git.upstream} · ${divergence}` : ""}
      </TooltipContent>
    </Tooltip>
  )
}

function PanelTabs({
  tabs,
  activeTab,
  availableTabs,
  onSelect,
  onAdd,
  onCloseTab,
  onClosePanel,
}: {
  tabs: WorkspaceTab[]
  activeTab: WorkspaceTab | null
  availableTabs: WorkspaceTab[]
  onSelect: (tab: WorkspaceTab) => void
  onAdd: (tab: WorkspaceTab) => void
  onCloseTab: (tab: WorkspaceTab) => void
  onClosePanel: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-1 border-b px-2">
      {tabs.length && activeTab ? (
        <div className="flex h-9 min-w-0 flex-1 items-center gap-0 overflow-x-auto">
          {tabs.map((tab) => {
            const label = tabLabel(t, tab)
            const Icon = TAB_ICONS[tab]
            const active = activeTab === tab
            return (
              <div
                key={tab}
                className="group/tab flex h-8 shrink-0 items-center rounded-md"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  data-workspace-tab={tab}
                  aria-pressed={active}
                  onClick={() => onSelect(tab)}
                  className={cn(
                    "relative h-8 flex-none gap-1.5 px-2 text-foreground/60 hover:text-foreground",
                    "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-foreground after:opacity-0",
                    active && "text-foreground after:opacity-100"
                  )}
                >
                  <Icon />
                  {label}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="-ml-1 opacity-0 transition-opacity group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label={t("session.workspace.closeTab", { name: label })}
                  onClick={() => onCloseTab(tab)}
                >
                  <XIcon />
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <span className="min-w-0 flex-1 px-2 text-xs text-muted-foreground">
          {t("session.workspace.sidebar")}
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-workspace-add-tab
            aria-label={t("session.workspace.addTab")}
          >
            <PlusIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuGroup>
            {availableTabs.map((tab) => {
              const label = tabLabel(t, tab)
              const Icon = TAB_ICONS[tab]
              return (
                <DropdownMenuItem
                  key={tab}
                  disabled={tabs.includes(tab)}
                  onSelect={() => onAdd(tab)}
                >
                  <Icon />
                  {label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("session.workspace.closeSidebar")}
        onClick={onClosePanel}
      >
        <XIcon />
      </Button>
    </div>
  )
}

export function SessionWorkspace({
  sessionId,
  conversationId,
  conversationPath,
  workingDirectory,
  projectId,
  mutationToken,
  title,
  contextLabel,
  updatedAt,
  runtimeLabel,
  workspaceAvailable,
  subagentsInstalled,
  initialGit,
  fileManagerLabel,
  environment,
  headerActions,
  toolbar,
  conversation,
  composer,
}: {
  sessionId: string
  conversationId: string
  conversationPath: string
  workingDirectory: string
  projectId: string | null
  mutationToken: string
  title: string
  contextLabel: string
  updatedAt: string
  runtimeLabel: string
  workspaceAvailable: boolean
  subagentsInstalled: boolean
  initialGit: ProjectGitStatus | null
  fileManagerLabel: string | null
  environment: SessionInspectorProps | null
  headerActions: ReactNode
  toolbar: ReactNode
  conversation: ReactNode
  composer: ReactNode
}) {
  const { t } = useI18n()
  const sidePanelRef = usePanelRef()
  const bottomPanelRef = usePanelRef()
  const workspaceElementRef = useRef<HTMLDivElement>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)
  const conversationContentRef = useRef<HTMLDivElement>(null)
  const bottomTerminalToggleRef = useRef<HTMLButtonElement>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const restoreSidebarToggleFocusRef = useRef(false)
  const desktopLayoutRef = useRef<boolean | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const [mobileSideOpen, setMobileSideOpen] = useState(false)
  const [bottomOpen, setBottomOpen] = useState(false)
  const [horizontalDragging, setHorizontalDragging] = useState(false)
  const [verticalDragging, setVerticalDragging] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const projectAvailable = projectId !== null && initialGit !== null
  const availableTabs = useMemo<WorkspaceTab[]>(() => {
    const workspaceTabs: WorkspaceTab[] = projectAvailable
      ? ["review", "files", "terminal"]
      : workspaceAvailable
        ? ["terminal"]
        : []
    return subagentsInstalled ? [...workspaceTabs, "subagents"] : workspaceTabs
  }, [projectAvailable, subagentsInstalled, workspaceAvailable])
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() =>
    projectAvailable ? ["review"] : workspaceAvailable ? ["terminal"] : []
  )
  const [activeTab, setActiveTab] = useState<WorkspaceTab | null>(() =>
    projectAvailable ? "review" : workspaceAvailable ? "terminal" : null
  )
  const [terminalPlacement, setTerminalPlacement] =
    useState<TerminalPlacement>(null)

  useEffect(() => {
    if (!shouldScrollToSessionTail(window.location.hash)) return

    const scrollContainer = conversationScrollRef.current
    const content = conversationContentRef.current
    if (!scrollContainer || !content) return

    let scrollFrame: number | undefined
    let releaseFrame: number | undefined
    let following = true
    let adjusting = false

    const scrollToLatest = () => {
      if (!following || scrollFrame !== undefined) return
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = undefined
        adjusting = true
        scrollContainer.scrollTop = scrollContainer.scrollHeight
        releaseFrame = requestAnimationFrame(() => {
          releaseFrame = undefined
          adjusting = false
        })
      })
    }
    const handleScroll = () => {
      if (adjusting) return
      following =
        scrollContainer.scrollHeight -
          scrollContainer.clientHeight -
          scrollContainer.scrollTop <=
        1
    }

    const resize = new ResizeObserver(scrollToLatest)
    resize.observe(content)
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    scrollToLatest()

    return () => {
      resize.disconnect()
      scrollContainer.removeEventListener("scroll", handleScroll)
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
      if (releaseFrame !== undefined) cancelAnimationFrame(releaseFrame)
    }
  }, [sessionId])

  useLayoutEffect(() => {
    const element = workspaceElementRef.current
    if (!element) return

    const update = (width: number) => {
      const nextIsDesktop = width >= SIDE_BY_SIDE_MIN_WIDTH
      const previousIsDesktop = desktopLayoutRef.current
      if (previousIsDesktop === nextIsDesktop) return
      desktopLayoutRef.current = nextIsDesktop
      setIsDesktop(nextIsDesktop)

      if (previousIsDesktop === null) return

      sidePanelRef.current?.collapse()
      setSideOpen(false)
      setMobileSideOpen(false)
    }

    update(element.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [sidePanelRef])

  useLayoutEffect(() => {
    if (!sideOpen) {
      restorePendingFocus(
        restoreSidebarToggleFocusRef,
        sidebarToggleRef.current
      )
    }
  }, [sideOpen])

  function showSidebar() {
    if (isDesktop) {
      sidePanelRef.current?.resize("38%")
      setSideOpen(true)
    } else {
      setMobileSideOpen(true)
      setSideOpen(true)
    }
  }

  function hideSidebar() {
    if (isDesktop) sidePanelRef.current?.collapse()
    else setMobileSideOpen(false)
    setSideOpen(false)
  }

  function closeSidebar() {
    restoreSidebarToggleFocusRef.current = true
    hideSidebar()
  }

  function selectTab(tab: WorkspaceTab) {
    setActiveTab(tab)
    if (tab === "terminal") {
      setTerminalPlacement("sidebar")
      bottomPanelRef.current?.collapse()
      setBottomOpen(false)
    }
  }

  function addTab(tab: WorkspaceTab) {
    setTabs((current) => (current.includes(tab) ? current : [...current, tab]))
    selectTab(tab)
    showSidebar()
  }

  function closeTab(tab: WorkspaceTab) {
    const index = tabs.indexOf(tab)
    const remaining = tabs.filter((candidate) => candidate !== tab)
    const nextActive =
      activeTab === tab
        ? (remaining[Math.min(index, remaining.length - 1)] ?? null)
        : activeTab
    setTabs(remaining)
    if (tab === "terminal" && terminalPlacement === "sidebar") {
      setTerminalPlacement(null)
      void stopTerminal()
    }
    if (activeTab === tab) {
      setActiveTab(nextActive)
    }
    requestAnimationFrame(() => {
      const target = nextActive
        ? document.querySelector<HTMLButtonElement>(
            `[data-workspace-tab="${nextActive}"]`
          )
        : document.querySelector<HTMLButtonElement>("[data-workspace-add-tab]")
      target?.focus()
    })
  }

  function showTerminalBelow() {
    setTerminalPlacement("bottom")
    if (activeTab === "terminal") {
      const replacement = tabs.find((tab) => tab !== "terminal") ?? null
      setActiveTab(replacement)
      if (!replacement) hideSidebar()
    }
    bottomPanelRef.current?.resize("32%")
    setBottomOpen(true)
  }

  function toggleBottomTerminal() {
    if (bottomOpen) {
      bottomPanelRef.current?.collapse()
      setBottomOpen(false)
    } else {
      showTerminalBelow()
    }
  }

  function toggleSidebar() {
    if (sideOpen) {
      hideSidebar()
      return
    }
    const target = activeTab ?? tabs[0] ?? null
    if (target) setActiveTab(target)
    if (target === "terminal") {
      setTerminalPlacement("sidebar")
      bottomPanelRef.current?.collapse()
      setBottomOpen(false)
    }
    showSidebar()
  }

  async function stopTerminal() {
    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}/terminal`, {
        method: "DELETE",
        headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
      })
      if (!response.ok) {
        throw new Error(t("session.workspace.closeTerminalFailed"))
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    }
  }

  function closeTerminal() {
    setTerminalPlacement(null)
    bottomPanelRef.current?.collapse()
    setBottomOpen(false)
    void stopTerminal()
    requestAnimationFrame(() => bottomTerminalToggleRef.current?.focus())
  }

  function moveTerminalToSidebar() {
    setTabs((current) =>
      current.includes("terminal") ? current : [...current, "terminal"]
    )
    setActiveTab("terminal")
    setTerminalPlacement("sidebar")
    bottomPanelRef.current?.collapse()
    setBottomOpen(false)
    showSidebar()
  }

  async function revealProject() {
    if (!projectId) return
    setRevealing(true)
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/reveal`, {
        method: "POST",
        headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
      })
      if (!response.ok) {
        const body = (await response.json()) as { error?: string }
        throw new Error(body.error ?? t("session.workspace.openProjectFailed"))
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setRevealing(false)
    }
  }

  useShortcutAction(
    "workspace.openReview",
    () => addTab("review"),
    projectAvailable
  )
  useShortcutAction(
    "workspace.toggleReview",
    () => {
      if (sideOpen && activeTab === "review") hideSidebar()
      else addTab("review")
    },
    projectAvailable
  )
  useShortcutAction(
    "workspace.toggleBottomPanel",
    toggleBottomTerminal,
    workspaceAvailable
  )
  useShortcutAction(
    "workspace.openTerminal",
    showTerminalBelow,
    workspaceAvailable
  )
  useShortcutAction(
    "workspace.openFileTree",
    () => addTab("files"),
    projectAvailable
  )

  const sidebarContent = (
    <div className="flex size-full min-h-0 flex-col overflow-hidden bg-background">
      <PanelTabs
        tabs={tabs}
        activeTab={activeTab}
        availableTabs={availableTabs}
        onSelect={selectTab}
        onAdd={addTab}
        onCloseTab={closeTab}
        onClosePanel={closeSidebar}
      />
      <div
        role="region"
        aria-label={
          activeTab
            ? t("session.workspace.view", { name: tabLabel(t, activeTab) })
            : t("session.workspace.sidebarView")
        }
        className="min-h-0 flex-1 animate-in duration-150 fade-in-0 motion-reduce:animate-none"
      >
        {activeTab === "review" && projectId && initialGit ? (
          <ProjectReviewPanel projectId={projectId} initialGit={initialGit} />
        ) : activeTab === "files" && projectId ? (
          <ProjectFilesPanel key={projectId} projectId={projectId} />
        ) : activeTab === "terminal" && terminalPlacement === "sidebar" ? (
          <ShellTerminal sessionId={sessionId} mutationToken={mutationToken} />
        ) : activeTab === "subagents" ? (
          <SubagentsPanel />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PlusIcon />
              </EmptyMedia>
              <EmptyTitle>{t("session.workspace.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("session.workspace.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )

  return (
    <>
      <ResizablePanelGroup
        data-conversation-id={conversationId}
        data-conversation-path={conversationPath}
        data-working-directory={workingDirectory}
        elementRef={workspaceElementRef}
        orientation="horizontal"
        style={{ height: "var(--session-workspace-height)" }}
        className={cn(
          "min-w-0 overflow-hidden [--session-workspace-height:calc(100svh-3rem)] md:[--session-workspace-height:100svh]",
          !horizontalDragging &&
            "[&>[data-panel]]:transition-[flex-grow] [&>[data-panel]]:duration-200 [&>[data-panel]]:ease-out motion-reduce:[&>[data-panel]]:transition-none"
        )}
      >
        <ResizablePanel id="conversation" minSize="20rem">
          <ResizablePanelGroup
            orientation="vertical"
            className={cn(
              !verticalDragging &&
                "[&>[data-panel]]:transition-[flex-grow] [&>[data-panel]]:duration-200 [&>[data-panel]]:ease-out motion-reduce:[&>[data-panel]]:transition-none"
            )}
          >
            <ResizablePanel id="conversation-main" minSize="16rem">
              <section className="flex size-full min-w-0 flex-col bg-background">
                <header className="shrink-0 border-b bg-background/95 backdrop-blur">
                  <div className="flex min-h-14 w-full items-center gap-3 px-3 py-2 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <h1 className="truncate text-sm font-semibold sm:text-base">
                        {title}
                      </h1>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span className="hidden min-w-0 truncate sm:inline">
                          {contextLabel} · {updatedAt}
                        </span>
                        <Badge
                          variant="outline"
                          className="hidden shrink-0 sm:inline-flex"
                        >
                          {runtimeLabel}
                        </Badge>
                        {projectId && initialGit ? (
                          <GitHeaderStatus
                            projectId={projectId}
                            initialGit={initialGit}
                            onOpenReview={() => addTab("review")}
                          />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {headerActions}
                      {projectId && fileManagerLabel ? (
                        <IconTooltip label={fileManagerLabel}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={!workspaceAvailable || revealing}
                            aria-label={fileManagerLabel}
                            onClick={() => void revealProject()}
                          >
                            <FolderOpenIcon />
                          </Button>
                        </IconTooltip>
                      ) : null}
                      {environment ? (
                        <SessionInspector {...environment} />
                      ) : null}
                      <IconTooltip
                        label={t("session.workspace.bottomTerminal")}
                      >
                        <Button
                          ref={bottomTerminalToggleRef}
                          variant="ghost"
                          size="icon-sm"
                          disabled={!workspaceAvailable}
                          aria-label={t(
                            "session.workspace.toggleBottomTerminal"
                          )}
                          aria-pressed={bottomOpen}
                          onClick={toggleBottomTerminal}
                        >
                          <PanelBottomIcon />
                        </Button>
                      </IconTooltip>
                      <IconTooltip label={t("session.workspace.sidebar")}>
                        <Button
                          ref={sidebarToggleRef}
                          variant="ghost"
                          size="icon-sm"
                          disabled={!availableTabs.length}
                          aria-label={t("session.workspace.toggleSidebar")}
                          aria-pressed={sideOpen}
                          onClick={toggleSidebar}
                        >
                          <PanelRightIcon />
                        </Button>
                      </IconTooltip>
                    </div>
                  </div>
                  <div className="mx-auto w-full max-w-[52rem] px-4 sm:px-6">
                    {toolbar}
                  </div>
                </header>

                <div
                  ref={conversationScrollRef}
                  className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
                >
                  <div
                    ref={conversationContentRef}
                    className="mx-auto grid w-full max-w-[52rem] min-w-0 gap-6 px-4 py-6 sm:px-6 sm:py-8"
                  >
                    {!workspaceAvailable ? (
                      <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm">
                        <p className="font-medium">
                          {t("session.readOnlyTitle")}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {t("session.readOnlyDescription")}
                        </p>
                      </div>
                    ) : null}
                    {conversation}
                  </div>
                </div>
                {composer}
              </section>
            </ResizablePanel>

            <ResizableHandle
              aria-hidden={!bottomOpen}
              className={cn(
                "transition-opacity duration-150",
                !bottomOpen && "hidden"
              )}
              onPointerDown={() => setVerticalDragging(true)}
              onPointerUp={() => setVerticalDragging(false)}
              onPointerCancel={() => setVerticalDragging(false)}
            />
            <ResizablePanel
              id="bottom-terminal"
              panelRef={bottomPanelRef}
              defaultSize={0}
              minSize="10rem"
              maxSize="65%"
              collapsedSize={0}
              collapsible
              onResize={(size) => {
                if (verticalDragging) setBottomOpen(size.inPixels > 1)
              }}
            >
              <div
                className={cn(
                  "size-full min-h-0 flex-col bg-background",
                  bottomOpen ? "flex" : "hidden"
                )}
                aria-hidden={!bottomOpen}
                inert={!bottomOpen}
              >
                <div className="flex min-h-9 shrink-0 items-center gap-2 border-b px-3">
                  <SquareTerminalIcon className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 text-xs font-medium">
                    {t("session.tab.terminal")}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("session.workspace.moveTerminal")}
                    onClick={moveTerminalToSidebar}
                  >
                    <PanelRightIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("session.workspace.closeTerminal")}
                    onClick={closeTerminal}
                  >
                    <XIcon />
                  </Button>
                </div>
                <div className="min-h-0 flex-1">
                  {terminalPlacement === "bottom" ? (
                    <ShellTerminal
                      sessionId={sessionId}
                      mutationToken={mutationToken}
                    />
                  ) : null}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle
          aria-hidden={!sideOpen}
          className={cn(
            "transition-opacity duration-150",
            sideOpen && isDesktop ? "flex" : "hidden"
          )}
          onPointerDown={() => setHorizontalDragging(true)}
          onPointerUp={() => setHorizontalDragging(false)}
          onPointerCancel={() => setHorizontalDragging(false)}
        />
        <ResizablePanel
          id="workspace-sidebar"
          panelRef={sidePanelRef}
          className={isDesktop ? "block" : "hidden"}
          defaultSize={0}
          minSize="20rem"
          maxSize="58%"
          collapsedSize={0}
          collapsible
          onResize={(size) => {
            if (horizontalDragging) setSideOpen(size.inPixels > 1)
          }}
        >
          <div
            className={cn("size-full", !sideOpen && "hidden")}
            aria-hidden={!sideOpen}
            inert={!sideOpen}
          >
            {isDesktop && sideOpen ? sidebarContent : null}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <Sheet
        open={!isDesktop && mobileSideOpen}
        onOpenChange={(open) => {
          setMobileSideOpen(open)
          setSideOpen(open)
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            sidebarToggleRef.current?.focus()
          }}
          className="gap-0 overflow-hidden p-0"
          style={{
            width: "min(42rem, calc(100vw - 0.5rem))",
            maxWidth: "none",
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("session.workspace.sidebar")}</SheetTitle>
            <SheetDescription>
              {t("session.workspace.sheetDescription")}
            </SheetDescription>
          </SheetHeader>
          {sidebarContent}
        </SheetContent>
      </Sheet>
    </>
  )
}
