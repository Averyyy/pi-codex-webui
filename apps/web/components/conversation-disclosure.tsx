"use client"

import type { ReactNode } from "react"
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleXIcon,
  LoaderCircleIcon,
} from "lucide-react"

import { buttonVariants } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

export type ConversationDisclosureTone =
  "neutral" | "execute" | "read" | "write" | "web" | "agent"

const toneClasses: Record<
  ConversationDisclosureTone,
  { icon: string; rail: string }
> = {
  neutral: {
    icon: "bg-muted text-muted-foreground",
    rail: "border-l-border",
  },
  execute: {
    icon: "bg-tool-execute/10 text-tool-execute",
    rail: "border-l-tool-execute/45",
  },
  read: {
    icon: "bg-tool-read/10 text-tool-read",
    rail: "border-l-tool-read/45",
  },
  write: {
    icon: "bg-tool-write/10 text-tool-write",
    rail: "border-l-tool-write/45",
  },
  web: {
    icon: "bg-tool-web/10 text-tool-web",
    rail: "border-l-tool-web/45",
  },
  agent: {
    icon: "bg-tool-agent/10 text-tool-agent",
    rail: "border-l-tool-agent/45",
  },
}

export function ConversationDisclosure({
  label,
  preview,
  icon,
  tone = "neutral",
  status,
  statusTone = "muted",
  children,
  defaultOpen = false,
  ariaLabel,
  className,
  contentClassName,
}: {
  label: ReactNode
  preview?: string
  icon: ReactNode
  tone?: ConversationDisclosureTone
  status?: string
  statusTone?: "muted" | "destructive" | "success" | "running"
  children: ReactNode
  defaultOpen?: boolean
  ariaLabel: string
  className?: string
  contentClassName?: string
}) {
  const statusIcon =
    statusTone === "destructive"
      ? CircleXIcon
      : statusTone === "running"
        ? LoaderCircleIcon
        : CheckCircle2Icon
  const StatusIcon = statusIcon

  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("min-w-0", className)}>
      <CollapsibleTrigger
        aria-label={ariaLabel}
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className:
            "w-full min-w-0 justify-start px-2 text-left font-normal text-muted-foreground data-[state=open]:[&_svg:last-child]:rotate-90",
        })}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5",
            toneClasses[tone].icon
          )}
        >
          {icon}
        </span>
        <span className="shrink-0 font-medium text-foreground">{label}</span>
        {preview ? (
          <span className="min-w-0 flex-1 truncate text-xs" title={preview}>
            {preview}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {status ? (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-xs [&_svg]:size-3",
              statusTone === "destructive" && "text-destructive",
              statusTone === "success" && "text-success",
              statusTone === "running" && "text-tool-execute"
            )}
          >
            <StatusIcon
              className={cn(
                statusTone === "running" && "motion-safe:animate-spin"
              )}
            />
            {status}
          </span>
        ) : null}
        <ChevronRightIcon
          data-icon="inline-end"
          className="shrink-0 transition-transform"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={cn(
            "mt-1 ml-4 min-w-0 border-l-[3px] py-2 pl-4",
            toneClasses[tone].rail,
            contentClassName
          )}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
