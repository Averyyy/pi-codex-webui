"use client"

import { Fragment, useState, type FormEvent } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArchiveIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  GitBranchPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  SquarePenIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"

import type { WorkspaceProject } from "@/lib/session-types"
import { responseJson } from "@/lib/api-response"
import {
  WorkspaceNavSession,
  type ConversationShortcutModifier,
} from "@/components/workspace-nav-session"

const VISIBLE_PROJECT_SESSIONS = 5
const pendingProjectMutations = new Set<string>()

type DialogKind = "archive" | "rename" | "worktree" | "remove"

interface MenuAction {
  kind: "pin" | "reveal" | DialogKind
  label: string
  icon: LucideIcon
  disabled?: boolean
  destructive?: boolean
  separatorBefore?: boolean
}

export function WorkspaceNavProject({
  project,
  mutationToken,
  runningSessionIds,
  unreadSessionIds,
  activeSessionId,
  conversationShortcuts,
  shortcutModifier,
}: {
  project: WorkspaceProject
  mutationToken: string
  runningSessionIds: ReadonlySet<string>
  unreadSessionIds: ReadonlySet<string>
  activeSessionId: string | null
  conversationShortcuts: ReadonlyMap<string, number>
  shortcutModifier?: ConversationShortcutModifier
}) {
  const pathname = usePathname()
  const router = useRouter()
  const projectPath = `/projects/${project.id}`
  const active = pathname.startsWith(projectPath)
  const sessions = project.sessions.filter((session) => !session.isPinned)
  const recent = sessions.slice(0, VISIBLE_PROJECT_SESSIONS)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [name, setName] = useState(project.name)
  const [worktreePath, setWorktreePath] = useState("")
  const [branch, setBranch] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mutate(
    url: string,
    options: { method?: "POST" | "PATCH" | "DELETE"; body?: unknown } = {}
  ) {
    if (pendingProjectMutations.has(project.id)) return false
    pendingProjectMutations.add(project.id)
    setWorking(true)
    setError(null)
    try {
      await responseJson(
        await fetch(url, {
          method: options.method ?? "POST",
          headers:
            options.body === undefined
              ? { "X-Pi-Web-Codex-Mutation-Token": mutationToken }
              : {
                  "X-Pi-Web-Codex-Mutation-Token": mutationToken,
                  "Content-Type": "application/json",
                },
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
        })
      )
      router.refresh()
      return true
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure)
      setError(message)
      if (!dialog) toast.error(message)
      return false
    } finally {
      pendingProjectMutations.delete(project.id)
      setWorking(false)
    }
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      await mutate(`/api/v1/projects/${project.id}`, {
        method: "PATCH",
        body: { name },
      })
    ) {
      setDialog(null)
    }
  }

  async function submitWorktree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      await mutate(`/api/v1/projects/${project.id}/worktrees`, {
        body: { path: worktreePath, branch },
      })
    ) {
      setDialog(null)
      setWorktreePath("")
      setBranch("")
    }
  }

  async function removeProject() {
    if (await mutate(`/api/v1/projects/${project.id}`, { method: "DELETE" })) {
      setDialog(null)
      if (active) router.push("/")
    }
  }

  async function archiveProject() {
    if (await mutate(`/api/v1/projects/${project.id}/archive`)) {
      setDialog(null)
      if (active) router.push("/")
    }
  }

  const actions: MenuAction[] = [
    {
      kind: "pin",
      label: project.isPinned ? "取消置顶项目" : "置顶项目",
      icon: PinIcon,
    },
    {
      kind: "reveal",
      label: "在文件管理器中显示",
      icon: FolderOpenIcon,
    },
    {
      kind: "worktree",
      label: "创建永久工作树",
      icon: GitBranchPlusIcon,
    },
    {
      kind: "rename",
      label: "重命名项目",
      icon: PencilIcon,
      separatorBefore: true,
    },
    {
      kind: "archive",
      label: "归档任务",
      icon: ArchiveIcon,
      disabled: project.sessionCount === 0,
    },
    {
      kind: "remove",
      label: "移除",
      icon: Trash2Icon,
      destructive: true,
      separatorBefore: true,
    },
  ]

  function selectAction(kind: MenuAction["kind"]) {
    if (kind === "pin") {
      void mutate(`/api/v1/projects/${project.id}`, {
        method: "PATCH",
        body: { pinned: !project.isPinned },
      })
      return
    }
    if (kind === "reveal") {
      void mutate(`/api/v1/projects/${project.id}/reveal`)
      return
    }
    if (kind === "rename") setName(project.name)
    setDialog(kind)
  }

  const dropdownItems = actions.map((action) => (
    <Fragment key={action.label}>
      {action.separatorBefore ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        variant={action.destructive ? "destructive" : "default"}
        disabled={working || action.disabled}
        onSelect={() => selectAction(action.kind)}
      >
        <action.icon />
        {action.label}
      </DropdownMenuItem>
    </Fragment>
  ))
  const contextItems = actions.map((action) => (
    <Fragment key={action.label}>
      {action.separatorBefore ? <ContextMenuSeparator /> : null}
      <ContextMenuItem
        variant={action.destructive ? "destructive" : "default"}
        disabled={working || action.disabled}
        onSelect={() => selectAction(action.kind)}
      >
        <action.icon />
        {action.label}
      </ContextMenuItem>
    </Fragment>
  ))

  return (
    <>
      <Collapsible asChild defaultOpen={active} className="group/collapsible">
        <SidebarMenuItem>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="group/project relative">
                <HoverCard openDelay={500} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="pr-24"
                    >
                      <Link
                        href={projectPath}
                        aria-current={
                          pathname === projectPath ? "page" : undefined
                        }
                      >
                        <FolderIcon />
                        <span className="min-w-0 flex-1 truncate">
                          {project.name}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </HoverCardTrigger>
                  <HoverCardContent side="right" align="start" className="w-80">
                    <div className="flex items-start gap-3">
                      <FolderIcon className="mt-0.5 size-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate font-medium">{project.name}</p>
                          {project.isPinned ? (
                            <PinIcon className="size-4 fill-current text-muted-foreground" />
                          ) : null}
                        </div>
                        <p className="mt-2 text-muted-foreground">
                          {project.sessionCount} 个对话串
                        </p>
                        <p className="mt-3 truncate border-t pt-3 text-muted-foreground">
                          {project.path}
                        </p>
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>

                {sessions.length > 0 ? (
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-0.5 right-[4.5rem]"
                      aria-label={`展开或折叠 ${project.name} 对话列表`}
                    >
                      <ChevronRightIcon className="transition-transform group-data-open/collapsible:rotate-90" />
                    </Button>
                  </CollapsibleTrigger>
                ) : null}

                <div className="pointer-events-none absolute top-0.5 right-1 flex items-center rounded-md bg-sidebar-accent opacity-0 transition-opacity group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100 group-hover/project:pointer-events-auto group-hover/project:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${project.name} 更多操作`}
                        disabled={working}
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      side="right"
                      className="w-52"
                    >
                      {dropdownItems}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link
                      href={`/new?projectId=${encodeURIComponent(project.id)}`}
                      aria-label={`在 ${project.name} 中新建对话`}
                    >
                      <SquarePenIcon />
                    </Link>
                  </Button>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
              {contextItems}
            </ContextMenuContent>
          </ContextMenu>

          <CollapsibleContent>
            <SidebarMenuSub>
              {recent.map((session) => (
                <WorkspaceNavSession
                  key={session.id}
                  session={session}
                  href={`${projectPath}/sessions/${session.id}`}
                  mutationToken={mutationToken}
                  running={runningSessionIds.has(session.id)}
                  unread={
                    session.id !== activeSessionId &&
                    unreadSessionIds.has(session.id)
                  }
                  shortcutNumber={conversationShortcuts.get(
                    `${projectPath}/sessions/${session.id}`
                  )}
                  shortcutModifier={shortcutModifier}
                  nested
                />
              ))}
              {sessions.length > recent.length ? (
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild>
                    <Link href={projectPath}>
                      查看全部 {sessions.length} 条
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ) : null}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !working) {
            setDialog(null)
            setError(null)
          }
        }}
      >
        <DialogContent>
          {dialog === "rename" ? (
            <form onSubmit={submitRename} className="contents">
              <DialogHeader>
                <DialogTitle>重命名项目</DialogTitle>
                <DialogDescription>
                  只修改侧栏显示名称，不会重命名磁盘目录。
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor={`project-name-${project.id}`}>项目名称</Label>
                <Input
                  id={`project-name-${project.id}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  required
                  disabled={working}
                />
              </div>
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={working}>
                    取消
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={working || !name.trim()}>
                  保存
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {dialog === "worktree" ? (
            <form onSubmit={submitWorktree} className="contents">
              <DialogHeader>
                <DialogTitle>创建永久工作树</DialogTitle>
                <DialogDescription>
                  Git 会创建新分支和工作树，完成后自动添加为项目。
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor={`worktree-path-${project.id}`}>
                    工作树路径
                  </Label>
                  <Input
                    id={`worktree-path-${project.id}`}
                    value={worktreePath}
                    onChange={(event) => setWorktreePath(event.target.value)}
                    placeholder="/Users/me/Documents/project-worktree"
                    autoFocus
                    required
                    disabled={working}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`worktree-branch-${project.id}`}>
                    新分支
                  </Label>
                  <Input
                    id={`worktree-branch-${project.id}`}
                    value={branch}
                    onChange={(event) => setBranch(event.target.value)}
                    placeholder="feature/my-worktree"
                    required
                    disabled={working}
                  />
                </div>
              </div>
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={working}>
                    取消
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={working || !worktreePath.trim() || !branch.trim()}
                >
                  创建
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {dialog === "archive" ? (
            <>
              <DialogHeader>
                <DialogTitle>归档 {project.name} 中的任务？</DialogTitle>
                <DialogDescription>
                  {`将从导航中移除 ${project.sessionCount} 个任务；正在运行的任务会先停止。项目目录和 Pi session 文件不会删除。`}
                </DialogDescription>
              </DialogHeader>
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={working}>
                    取消
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={working}
                  aria-busy={working}
                  onClick={() => void archiveProject()}
                >
                  归档 {project.sessionCount} 个任务
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {dialog === "remove" ? (
            <>
              <DialogHeader>
                <DialogTitle>移除 {project.name}？</DialogTitle>
                <DialogDescription>
                  只会从项目列表中移除。已有对话、磁盘目录和 Pi session
                  文件都不会改变。
                </DialogDescription>
              </DialogHeader>
              {error ? (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={working}>
                    取消
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={working}
                  aria-busy={working}
                  onClick={() => void removeProject()}
                >
                  移除
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
