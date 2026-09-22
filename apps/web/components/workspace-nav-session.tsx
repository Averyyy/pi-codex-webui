"use client"

import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type SyntheticEvent,
} from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  PinIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { displaySessionTitle } from "@/lib/session-display"
import { responseJson } from "@/lib/api-response"
import type { SessionSummary } from "@/lib/session-types"
import type { WorkspaceSessionMutationFocusRequest } from "@/lib/workspace-nav-focus"
import {
  clearWorkspaceNavDragSource,
  getWorkspaceNavDragSource,
  sameWorkspaceNavOrderScope,
  setWorkspaceNavDragSource,
  type WorkspaceNavOrderMutation,
  type WorkspaceNavOrderScope,
} from "@/lib/workspace-nav-order"
import { useI18n } from "@/components/i18n-provider"
import { SESSION_CATALOG_CHANGED } from "@/lib/session-catalog-events"

export function WorkspaceNavSession({
  session,
  href,
  mutationToken,
  running,
  unread,
  nested = false,
  shortcut,
  onMutationFocus,
  orderScope,
  orderProjectId,
  orderItems,
  onOrderRequest,
}: {
  session: SessionSummary
  href: string
  mutationToken: string
  running: boolean
  unread: boolean
  nested?: boolean
  shortcut?: { label: string; aria: string }
  onMutationFocus: (request: WorkspaceSessionMutationFocusRequest) => void
  orderScope?: WorkspaceNavOrderScope
  orderProjectId?: string
  orderItems?: readonly string[]
  onOrderRequest?: (mutation: WorkspaceNavOrderMutation) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()
  const workingRef = useRef(false)
  const statusDescriptionId = useId()
  const [workingAction, setWorkingAction] = useState<"pin" | "archive" | null>(
    null
  )
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(
    null
  )
  const suppressClickRef = useRef(false)
  const working = workingAction !== null
  const title = displaySessionTitle(session, {
    task: t("workspace.nav.newTask"),
    conversation: t("workspace.nav.unnamedConversation"),
  })
  const orderIndex = orderItems?.indexOf(session.id) ?? -1
  const previousOrderId =
    orderIndex > 0 ? orderItems?.[orderIndex - 1] : undefined
  const nextOrderId =
    orderIndex >= 0 && orderItems && orderIndex < orderItems.length - 1
      ? orderItems[orderIndex + 1]
      : undefined

  function requestMove(position: "before" | "after") {
    const targetId = position === "before" ? previousOrderId : nextOrderId
    if (!orderScope || !targetId || !onOrderRequest) return
    onOrderRequest({
      scope: orderScope,
      projectId: orderProjectId,
      itemId: session.id,
      targetId,
      position,
    })
  }

  function parseDragData(event: DragEvent) {
    const raw = event.dataTransfer.getData("application/x-pi-web-codex-order")
    if (!raw) return null
    try {
      const value = JSON.parse(raw) as {
        scope?: WorkspaceNavOrderScope
        projectId?: string
        itemId?: string
      }
      if (!value.scope || !value.itemId) return null
      return value
    } catch {
      return null
    }
  }

  function handleDragStart(event: DragEvent) {
    if (!orderScope || !onOrderRequest) return
    event.stopPropagation()
    suppressClickRef.current = true
    const source = {
      scope: orderScope,
      projectId: orderProjectId,
      itemId: session.id,
    }
    setWorkspaceNavDragSource(source)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(
      "application/x-pi-web-codex-order",
      JSON.stringify(source)
    )
    event.dataTransfer.setData("text/plain", session.id)
  }

  function handleDragOver(event: DragEvent) {
    if (!orderScope || !onOrderRequest) return
    event.stopPropagation()
    const source = getWorkspaceNavDragSource() ?? parseDragData(event)
    if (
      !source ||
      source.itemId === session.id ||
      !sameWorkspaceNavOrderScope(
        {
          scope: source.scope!,
          projectId: source.projectId,
          itemId: source.itemId!,
          targetId: session.id,
          position: "before",
        },
        {
          scope: orderScope,
          projectId: orderProjectId,
          itemId: session.id,
          targetId: session.id,
          position: "before",
        }
      )
    ) {
      setDropPosition(null)
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const bounds = event.currentTarget.getBoundingClientRect()
    setDropPosition(
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
    )
  }

  function handleDragLeave(event: DragEvent) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return
    }
    setDropPosition(null)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    const position: "before" | "after" =
      event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
    const source = getWorkspaceNavDragSource() ?? parseDragData(event)
    setDropPosition(null)
    clearWorkspaceNavDragSource()
    if (!source || !orderScope || !onOrderRequest) return
    if (source.itemId === session.id) return
    const mutation: WorkspaceNavOrderMutation = {
      scope: source.scope!,
      projectId: source.projectId,
      itemId: source.itemId!,
      targetId: session.id,
      position,
    }
    if (
      !sameWorkspaceNavOrderScope(mutation, {
        scope: orderScope,
        projectId: orderProjectId,
        itemId: session.id,
        targetId: session.id,
        position,
      })
    ) {
      return
    }
    onOrderRequest(mutation)
  }

  function handleClickCapture(event: SyntheticEvent) {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  async function mutate(
    action: "pin" | "archive",
    path: string,
    body?: unknown,
    onSuccess?: () => void
  ) {
    if (workingRef.current) return false
    workingRef.current = true
    setWorkingAction(action)
    try {
      await responseJson(
        await fetch(path, {
          method: "POST",
          headers:
            body === undefined
              ? { "X-Pi-Web-Codex-Mutation-Token": mutationToken }
              : {
                  "X-Pi-Web-Codex-Mutation-Token": mutationToken,
                  "Content-Type": "application/json",
                },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      )
      onSuccess?.()
      window.dispatchEvent(new Event(SESSION_CATALOG_CHANGED))
      router.refresh()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      workingRef.current = false
      setWorkingAction(null)
    }
  }

  const actions = (
    <div className="pointer-events-none absolute top-1 right-1 flex items-center rounded-md bg-sidebar-accent opacity-0 transition-opacity group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100 group-hover/session:pointer-events-auto group-hover/session:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-disabled={working}
            aria-busy={workingAction === "pin"}
            data-session-pin={session.id}
            data-pinned={String(session.isPinned)}
            aria-label={
              session.isPinned
                ? t("workspace.nav.unpinConversation")
                : t("workspace.nav.pinConversation")
            }
            onClick={() =>
              void mutate(
                "pin",
                `/api/v1/sessions/${session.id}/pin`,
                { pinned: !session.isPinned },
                () =>
                  onMutationFocus({
                    kind: "pin",
                    sessionId: session.id,
                    pinned: !session.isPinned,
                    projectId: session.projectId,
                  })
              )
            }
          >
            {workingAction === "pin" ? (
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
            ) : (
              <PinIcon className={cn(session.isPinned && "fill-current")} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {session.isPinned
            ? t("workspace.nav.unpin")
            : t("workspace.nav.pinConversation")}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-disabled={working}
            aria-busy={workingAction === "archive"}
            data-session-archive={session.id}
            aria-label={t("workspace.nav.archiveConversation")}
            onClick={() => {
              void (async () => {
                const navigateHome = pathname === href
                if (
                  await mutate(
                    "archive",
                    `/api/v1/sessions/${session.id}/archive`,
                    undefined,
                    () =>
                      onMutationFocus({
                        kind: "archive",
                        sessionId: session.id,
                        href,
                        navigateHome,
                      })
                  )
                ) {
                  if (navigateHome) router.push("/")
                }
              })()
            }}
          >
            {workingAction === "archive" ? (
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
            ) : (
              <ArchiveIcon />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {t("workspace.nav.archiveConversation")}
        </TooltipContent>
      </Tooltip>
      {orderScope && onOrderRequest ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!previousOrderId}
                aria-label={t("workspace.nav.moveConversationUp")}
                onClick={() => requestMove("before")}
              >
                <ChevronUpIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t("workspace.nav.moveConversationUp")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!nextOrderId}
                aria-label={t("workspace.nav.moveConversationDown")}
                onClick={() => requestMove("after")}
              >
                <ChevronDownIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t("workspace.nav.moveConversationDown")}
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  )
  const shortcutHint =
    shortcut?.label && !running && !unread ? (
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md bg-sidebar-accent px-1.5 py-1 font-sans text-[11px] leading-none text-muted-foreground shadow-xs group-focus-within/session:hidden group-hover/session:hidden [@media(hover:none)]:hidden">
        {shortcut.label}
      </kbd>
    ) : null
  const indicator = running ? (
    <span
      id={statusDescriptionId}
      className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
    >
      <LoaderCircleIcon
        aria-hidden="true"
        className="size-4 animate-spin motion-reduce:animate-none"
      />
      <span className="sr-only">{t("workspace.nav.running")}</span>
    </span>
  ) : unread ? (
    <span
      id={statusDescriptionId}
      className="pointer-events-none absolute top-1/2 right-2 size-2 -translate-y-1/2 rounded-full bg-blue-500"
    >
      <span className="sr-only">{t("workspace.nav.newlyCompleted")}</span>
    </span>
  ) : null

  if (nested) {
    return (
      <SidebarMenuSubItem
        className={cn(
          "group/session",
          dropPosition === "before" && "border-t-2 border-primary",
          dropPosition === "after" && "border-b-2 border-primary"
        )}
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 28px" }}
        draggable={Boolean(orderScope && onOrderRequest)}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={() => {
          clearWorkspaceNavDragSource()
          setDropPosition(null)
          window.setTimeout(() => {
            suppressClickRef.current = false
          }, 0)
        }}
        onClickCapture={handleClickCapture}
      >
        <SidebarMenuSubButton
          asChild
          isActive={pathname === href}
          className={cn("pr-12", orderScope && "pr-24")}
        >
          <Link
            href={href}
            prefetch={false}
            title={title}
            data-conversation-shortcut={href}
            aria-keyshortcuts={shortcut?.aria || undefined}
            aria-describedby={
              running || unread ? statusDescriptionId : undefined
            }
            aria-current={pathname === href ? "page" : undefined}
          >
            <span className="min-w-0 truncate">{title}</span>
          </Link>
        </SidebarMenuSubButton>
        {shortcutHint}
        {indicator}
        {actions}
      </SidebarMenuSubItem>
    )
  }

  return (
    <SidebarMenuItem
      className={cn(
        "group/session",
        dropPosition === "before" && "border-t-2 border-primary",
        dropPosition === "after" && "border-b-2 border-primary"
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 32px" }}
      draggable={Boolean(orderScope && onOrderRequest)}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={() => {
        clearWorkspaceNavDragSource()
        setDropPosition(null)
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }}
      onClickCapture={handleClickCapture}
    >
      <SidebarMenuButton
        asChild
        isActive={pathname === href}
        tooltip={title}
        className={cn("pr-12", orderScope && "pr-24")}
      >
        <Link
          href={href}
          prefetch={false}
          data-conversation-shortcut={href}
          aria-keyshortcuts={shortcut?.aria || undefined}
          aria-describedby={running || unread ? statusDescriptionId : undefined}
          aria-current={pathname === href ? "page" : undefined}
        >
          <MessageSquareTextIcon />
          <span className="min-w-0 flex-1 truncate">{title}</span>
        </Link>
      </SidebarMenuButton>
      {shortcutHint}
      {indicator}
      {actions}
    </SidebarMenuItem>
  )
}
