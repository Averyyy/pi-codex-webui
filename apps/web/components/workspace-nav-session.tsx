"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArchiveIcon, MessageSquareTextIcon, PinIcon } from "lucide-react"
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
import type { SessionSummary } from "@/lib/session-types"

export type ConversationShortcutModifier = "⌘" | "Ctrl"

async function responseJson(response: Response) {
  const body = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(body.error ?? `操作失败（HTTP ${response.status}）。`)
  }
  return body
}

export function WorkspaceNavSession({
  session,
  href,
  mutationToken,
  nested = false,
  shortcutNumber,
  shortcutModifier,
}: {
  session: SessionSummary
  href: string
  mutationToken: string
  nested?: boolean
  shortcutNumber?: number
  shortcutModifier?: ConversationShortcutModifier
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [working, setWorking] = useState(false)
  const title = displaySessionTitle(session)
  const shortcutLabel =
    shortcutNumber === undefined || shortcutModifier === undefined
      ? null
      : shortcutModifier === "⌘"
        ? `⌘${shortcutNumber}`
        : `Ctrl+${shortcutNumber}`
  const ariaShortcut =
    shortcutNumber === undefined || shortcutModifier === undefined
      ? undefined
      : `${shortcutModifier === "⌘" ? "Meta" : "Control"}+${shortcutNumber}`

  async function mutate(path: string, body?: unknown) {
    setWorking(true)
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
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setWorking(false)
    }
  }

  const actions = (
    <div
      className={cn(
        "pointer-events-none absolute top-1 right-1 flex items-center rounded-md bg-sidebar-accent opacity-0 transition-opacity group-focus-within/session:pointer-events-auto group-focus-within/session:opacity-100 group-hover/session:pointer-events-auto group-hover/session:opacity-100",
        shortcutLabel && "hidden"
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={working}
            aria-label={session.isPinned ? "取消置顶对话" : "置顶对话"}
            onClick={() =>
              void mutate(`/api/v1/sessions/${session.id}/pin`, {
                pinned: !session.isPinned,
              })
            }
          >
            <PinIcon className={cn(session.isPinned && "fill-current")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {session.isPinned ? "取消置顶" : "置顶对话"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={working}
            aria-label="归档对话"
            onClick={() => {
              if (pathname === href) router.push("/")
              void mutate(`/api/v1/sessions/${session.id}/archive`)
            }}
          >
            <ArchiveIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">归档对话</TooltipContent>
      </Tooltip>
    </div>
  )
  const shortcut = shortcutLabel ? (
    <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md bg-sidebar-accent px-1.5 py-1 font-sans text-[11px] leading-none text-muted-foreground shadow-xs">
      {shortcutLabel}
    </kbd>
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
            aria-keyshortcuts={ariaShortcut}
          >
            <span className="min-w-0 truncate">{title}</span>
          </Link>
        </SidebarMenuSubButton>
        {shortcut}
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
          aria-keyshortcuts={ariaShortcut}
        >
          <MessageSquareTextIcon />
          <span className="min-w-0 flex-1 truncate">{title}</span>
        </Link>
      </SidebarMenuButton>
      {shortcut}
      {actions}
    </SidebarMenuItem>
  )
}
