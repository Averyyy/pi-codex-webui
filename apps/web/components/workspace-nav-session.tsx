"use client"

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArchiveIcon,
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
import { useI18n } from "@/components/i18n-provider"

export function WorkspaceNavSession({
  session,
  href,
  mutationToken,
  running,
  unread,
  nested = false,
  shortcut,
  onMutationFocus,
}: {
  session: SessionSummary
  href: string
  mutationToken: string
  running: boolean
  unread: boolean
  nested?: boolean
  shortcut?: { label: string; aria: string }
  onMutationFocus: (request: WorkspaceSessionMutationFocusRequest) => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()
  const workingRef = useRef(false)
  const statusDescriptionId = useId()
  const [workingAction, setWorkingAction] = useState<"pin" | "archive" | null>(
    null
  )
  const working = workingAction !== null
  const title = displaySessionTitle(session, {
    task: t("workspace.nav.newTask"),
    conversation: t("workspace.nav.unnamedConversation"),
  })

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
      <SidebarMenuSubItem className="group/session">
        <SidebarMenuSubButton
          asChild
          isActive={pathname === href}
          className="pr-12"
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
    <SidebarMenuItem className="group/session">
      <SidebarMenuButton
        asChild
        isActive={pathname === href}
        tooltip={title}
        className="pr-12"
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
