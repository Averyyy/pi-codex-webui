"use client"

import type { ReactNode } from "react"
import { ChevronRightIcon } from "lucide-react"

import { buttonVariants } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

export function ConversationDisclosure({
  label,
  preview,
  icon,
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
  status?: string
  statusTone?: "muted" | "destructive"
  children: ReactNode
  defaultOpen?: boolean
  ariaLabel: string
  className?: string
  contentClassName?: string
}) {
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
        <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
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
              "shrink-0 text-xs",
              statusTone === "destructive" && "text-destructive"
            )}
          >
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
            "mt-1 ml-4 min-w-0 border-l py-2 pl-4",
            contentClassName
          )}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
