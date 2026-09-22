"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleXIcon,
  CircleMinusIcon,
  LoaderCircleIcon,
} from "lucide-react"

import { buttonVariants } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

export const ConversationAnchorContext = createContext<string | undefined>(
  undefined
)

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener)
  return () => window.removeEventListener("hashchange", listener)
}

function currentHash() {
  return window.location.hash
}
function serverHash() {
  return ""
}

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
  meta,
  children,
  defaultOpen = false,
  ariaLabel,
  collapseAriaLabel,
  className,
  contentClassName,
  variant = "tool",
  collapsible = true,
  entryIds,
  open: controlledOpen,
  onOpenChange,
}: {
  label: ReactNode
  preview?: string
  icon: ReactNode
  tone?: ConversationDisclosureTone
  status?: string
  statusTone?: "muted" | "destructive" | "success" | "running"
  meta?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  ariaLabel: string
  collapseAriaLabel?: string
  className?: string
  contentClassName?: string
  variant?: "tool" | "process"
  collapsible?: boolean
  entryIds?: readonly string[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const anchorEntryId = useContext(ConversationAnchorContext)
  const hash = useSyncExternalStore(subscribeHash, currentHash, serverHash)
  const targeted = Boolean(
    hash &&
    (hash === `#entry-${anchorEntryId}` ||
      entryIds?.some((id) => hash === `#entry-${id}`))
  )
  const [selection, setSelection] = useState<{ open: boolean; hash: string }>()
  const open =
    !collapsible ||
    (targeted && selection?.hash !== hash
      ? true
      : (controlledOpen ?? selection?.open ?? defaultOpen))

  useEffect(() => {
    if (!targeted || !open) return
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ block: "center" })
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, open, targeted])

  const statusIcon =
    statusTone === "destructive"
      ? CircleXIcon
      : statusTone === "running"
        ? LoaderCircleIcon
        : statusTone === "success"
          ? CheckCircle2Icon
          : CircleMinusIcon
  const StatusIcon = statusIcon
  const Trigger = collapsible ? CollapsibleTrigger : "div"
  const content = (
    <CollapsibleContent>
      <div
        className={cn(
          "min-w-0",
          variant === "tool" &&
            "mt-1 ml-2 border-l-2 py-2 pl-3 sm:ml-4 sm:pl-4",
          variant === "tool" && toneClasses[tone].rail,
          contentClassName
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  )

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setSelection({ open: next, hash })
        onOpenChange?.(next)
      }}
      data-running={statusTone === "running" ? "true" : undefined}
      data-conversation-disclosure={variant}
      className={cn(
        "min-w-0",
        variant === "process" && "flex flex-col",
        className
      )}
    >
      <Trigger
        aria-label={
          collapsible
            ? open
              ? (collapseAriaLabel ?? ariaLabel)
              : ariaLabel
            : undefined
        }
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: cn(
            "conversation-disclosure-trigger w-full min-w-0 justify-start px-2 text-left font-normal text-muted-foreground data-[state=open]:[&>[data-disclosure-chevron]]:rotate-90",
            variant === "process" &&
              "h-auto w-fit max-w-full rounded-sm px-0 py-1 hover:bg-transparent disabled:opacity-100 aria-expanded:bg-transparent"
          ),
        })}
      >
        {variant === "tool" ? (
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5",
              toneClasses[tone].icon
            )}
          >
            {icon}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 truncate",
            variant === "tool" && "font-medium text-foreground"
          )}
        >
          {label}
        </span>
        {preview ? (
          <span className="min-w-0 flex-1 truncate text-xs" title={preview}>
            {preview}
          </span>
        ) : variant === "tool" ? (
          <span className="min-w-0 flex-1" />
        ) : null}
        {meta}
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
        {collapsible ? (
          <ChevronRightIcon
            data-icon="inline-end"
            data-disclosure-chevron=""
            aria-hidden="true"
            className="shrink-0 transition-transform"
          />
        ) : null}
      </Trigger>
      {content}
    </Collapsible>
  )
}
