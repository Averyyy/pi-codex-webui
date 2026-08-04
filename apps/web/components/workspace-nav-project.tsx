"use client"

import { Fragment, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArchiveIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
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
import {
  rememberFocusTarget,
  restoreFocusTarget,
} from "@workspace/ui/lib/focus-restoration"

import type { WorkspaceProject } from "@/lib/session-types"
import type { WorkspaceSessionMutationFocusRequest } from "@/lib/workspace-nav-focus"
import { responseJson } from "@/lib/api-response"
import {
  WorkspaceNavSession,
  type ConversationShortcutModifier,
} from "@/components/workspace-nav-session"
import { useI18n } from "@/components/i18n-provider"

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
  onSessionMutationFocus,
}: {
  project: WorkspaceProject
  mutationToken: string
  runningSessionIds: ReadonlySet<string>
  unreadSessionIds: ReadonlySet<string>
  activeSessionId: string | null
  conversationShortcuts: ReadonlyMap<string, number>
  shortcutModifier?: ConversationShortcutModifier
  onSessionMutationFocus: (
    request: WorkspaceSessionMutationFocusRequest
  ) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { locale, t } = useI18n()
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
  const dialogReturnFocusRef = useRef<HTMLElement>(null)
  const localizedSessionCount = project.sessionCount.toLocaleString(locale)

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
      label: project.isPinned
        ? t("workspace.project.unpin")
        : t("workspace.project.pin"),
      icon: PinIcon,
    },
    {
      kind: "reveal",
      label: t("workspace.project.reveal"),
      icon: FolderOpenIcon,
    },
    {
      kind: "worktree",
      label: t("workspace.project.createWorktree"),
      icon: GitBranchPlusIcon,
    },
    {
      kind: "rename",
      label: t("workspace.project.rename"),
      icon: PencilIcon,
      separatorBefore: true,
    },
    {
      kind: "archive",
      label: t("workspace.project.archiveConversations"),
      icon: ArchiveIcon,
      disabled: project.sessionCount === 0,
    },
    {
      kind: "remove",
      label: t("workspace.project.remove"),
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
    setError(null)
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
              <div
                className="group/project relative"
                onContextMenu={(event) => {
                  rememberFocusTarget(
                    dialogReturnFocusRef,
                    event.currentTarget.querySelector<HTMLElement>(
                      "a[data-project-link]"
                    )
                  )
                }}
              >
                <HoverCard openDelay={500} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="pr-24"
                    >
                      <Link
                        href={projectPath}
                        data-project-link={project.id}
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
                          {t("workspace.project.conversationCount", {
                            count: localizedSessionCount,
                          })}
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
                      aria-label={t("workspace.project.toggleConversations", {
                        name: project.name,
                      })}
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
                        onFocus={(event) => {
                          rememberFocusTarget(
                            dialogReturnFocusRef,
                            event.currentTarget
                          )
                        }}
                        onClick={(event) => {
                          rememberFocusTarget(
                            dialogReturnFocusRef,
                            event.currentTarget
                          )
                        }}
                        aria-label={t("workspace.project.moreActions", {
                          name: project.name,
                        })}
                        aria-disabled={working}
                        aria-busy={working}
                      >
                        {working ? (
                          <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                        ) : (
                          <MoreHorizontalIcon />
                        )}
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
                      aria-label={t("workspace.project.newConversation", {
                        name: project.name,
                      })}
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
                  onMutationFocus={onSessionMutationFocus}
                  nested
                />
              ))}
              {sessions.length > recent.length ? (
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild>
                    <Link href={projectPath}>
                      {t("workspace.project.viewAll", {
                        count: sessions.length.toLocaleString(locale),
                      })}
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
        <DialogContent
          onCloseAutoFocus={(event) => {
            if (restoreFocusTarget(dialogReturnFocusRef)) {
              event.preventDefault()
            }
          }}
        >
          {dialog === "rename" ? (
            <form onSubmit={submitRename} className="contents">
              <DialogHeader>
                <DialogTitle>{t("workspace.project.rename")}</DialogTitle>
                <DialogDescription>
                  {t("workspace.project.renameDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor={`project-name-${project.id}`}>
                  {t("workspace.project.name")}
                </Label>
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
                    {t("workspace.project.cancel")}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={working || !name.trim()}>
                  {t("workspace.project.save")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {dialog === "worktree" ? (
            <form onSubmit={submitWorktree} className="contents">
              <DialogHeader>
                <DialogTitle>
                  {t("workspace.project.createWorktree")}
                </DialogTitle>
                <DialogDescription>
                  {t("workspace.project.worktreeDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor={`worktree-path-${project.id}`}>
                    {t("workspace.project.worktreePath")}
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
                    {t("workspace.project.newBranch")}
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
                    {t("workspace.project.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={working || !worktreePath.trim() || !branch.trim()}
                >
                  {t("workspace.project.create")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {dialog === "archive" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("workspace.project.archiveTitle", {
                    name: project.name,
                  })}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    project.sessionCount === 1
                      ? "workspace.project.archiveDescriptionOne"
                      : "workspace.project.archiveDescriptionMany",
                    { count: localizedSessionCount }
                  )}
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
                    {t("workspace.project.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  aria-disabled={working}
                  aria-busy={working}
                  onClick={() => void archiveProject()}
                >
                  {working ? (
                    <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {t(
                    project.sessionCount === 1
                      ? "workspace.project.archiveConfirmOne"
                      : "workspace.project.archiveConfirmMany",
                    { count: localizedSessionCount }
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {dialog === "remove" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t("workspace.project.removeTitle", { name: project.name })}
                </DialogTitle>
                <DialogDescription>
                  {t("workspace.project.removeDescription")}
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
                    {t("workspace.project.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  aria-disabled={working}
                  aria-busy={working}
                  onClick={() => void removeProject()}
                >
                  {working ? (
                    <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {t("workspace.project.remove")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
