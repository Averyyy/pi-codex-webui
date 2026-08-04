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
import {
  SessionInspector,
  type SessionInspectorProps,
} from "@/components/session-inspector"
import { SubagentsPanel } from "@/components/subagents"
import type { ProjectGitStatus } from "@/lib/project-git"
import { shouldScrollToSessionTail } from "@/lib/session-scroll"

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

const TAB_METADATA: Record<WorkspaceTab, { label: string; icon: LucideIcon }> =
  {
    review: { label: "审阅", icon: FileDiffIcon },
    files: { label: "文件", icon: FilesIcon },
    terminal: { label: "终端", icon: SquareTerminalIcon },
    subagents: { label: "子智能体", icon: BotIcon },
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
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-1 border-b px-2">
      {tabs.length && activeTab ? (
        <div className="flex h-9 min-w-0 flex-1 items-center gap-0 overflow-x-auto">
          {tabs.map((tab) => {
            const metadata = TAB_METADATA[tab]
            const Icon = metadata.icon
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
                  {metadata.label}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="-ml-1 opacity-0 transition-opacity group-focus-within/tab:opacity-100 group-hover/tab:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label={`关闭${metadata.label}标签页`}
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
          会话侧栏
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-workspace-add-tab
            aria-label="添加会话侧栏标签页"
          >
            <PlusIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuGroup>
            {availableTabs.map((tab) => {
              const metadata = TAB_METADATA[tab]
              const Icon = metadata.icon
              return (
                <DropdownMenuItem
                  key={tab}
                  disabled={tabs.includes(tab)}
                  onSelect={() => onAdd(tab)}
                >
                  <Icon />
                  {metadata.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="关闭会话侧栏"
        onClick={onClosePanel}
      >
        <XIcon />
      </Button>
    </div>
  )
}

export function SessionWorkspace({
  sessionId,
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

  useEffect(() => {
    const element = workspaceElementRef.current
    if (!element) return

    const update = (width: number) => {
      const nextIsDesktop = width >= SIDE_BY_SIDE_MIN_WIDTH
      if (desktopLayoutRef.current === nextIsDesktop) return
      desktopLayoutRef.current = nextIsDesktop
      setIsDesktop(nextIsDesktop)
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
      if (!response.ok) throw new Error("无法关闭终端。")
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
        throw new Error(body.error ?? "无法打开项目目录。")
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setRevealing(false)
    }
  }

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
          activeTab ? `${TAB_METADATA[activeTab].label}视图` : "会话侧栏视图"
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
              <EmptyTitle>添加标签页</EmptyTitle>
              <EmptyDescription>从上方菜单添加可用视图。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )

  return (
    <>
      <ResizablePanelGroup
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
                        <span className="truncate">
                          {contextLabel} · {updatedAt}
                        </span>
                        <Badge variant="outline" className="shrink-0">
                          {runtimeLabel}
                        </Badge>
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
                      <IconTooltip label="底部终端">
                        <Button
                          ref={bottomTerminalToggleRef}
                          variant="ghost"
                          size="icon-sm"
                          disabled={!workspaceAvailable}
                          aria-label="切换底部终端"
                          aria-pressed={bottomOpen}
                          onClick={toggleBottomTerminal}
                        >
                          <PanelBottomIcon />
                        </Button>
                      </IconTooltip>
                      <IconTooltip label="会话侧栏">
                        <Button
                          ref={sidebarToggleRef}
                          variant="ghost"
                          size="icon-sm"
                          disabled={!availableTabs.length}
                          aria-label="切换会话侧栏"
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
                        <p className="font-medium">历史会话仅可阅读</p>
                        <p className="mt-1 text-muted-foreground">
                          原工作目录已不存在，因此不会启动 Runtime，也不会读取
                          Files、Git 或项目资源。
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
              onResize={(size) => setBottomOpen(size.inPixels > 1)}
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
                    终端
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="将终端移到侧边栏"
                    onClick={moveTerminalToSidebar}
                  >
                    <PanelRightIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="关闭终端"
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
          onResize={(size) => setSideOpen(size.inPixels > 1)}
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
            <SheetTitle>会话侧栏</SheetTitle>
            <SheetDescription>
              查看代码审阅、项目文件、终端或子智能体。
            </SheetDescription>
          </SheetHeader>
          {sidebarContent}
        </SheetContent>
      </Sheet>
    </>
  )
}
