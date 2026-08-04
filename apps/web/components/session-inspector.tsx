"use client"

import type { ReactNode } from "react"
import {
  Clock3Icon,
  FileDiffIcon,
  FolderIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  ListFilterIcon,
  SquareTerminalIcon,
  type LucideIcon,
} from "lucide-react"

import type { RuntimeStatus } from "@workspace/runtime-protocol"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { SubagentsSummary } from "@/components/subagents"
import { useI18n } from "@/components/i18n-provider"
import { useStreamingRuntimeStatus } from "@/components/session-streaming-context"
import type { Translator } from "@/lib/i18n"
import type { ProjectGitStatus } from "@/lib/project-git"
import { formatTimestamp } from "@/lib/session-display"

function statusLabel(t: Translator, status: RuntimeStatus) {
  const keys = {
    stopped: "session.status.stopped",
    starting: "session.status.starting",
    ready: "session.status.ready",
    busy: "session.status.busy",
    stopping: "session.status.stopping",
    crashed: "session.status.crashed",
  } as const
  return t(keys[status])
}

export interface SessionInspectorProps {
  cwd: string
  projectName: string | null
  runtimeKind: "pi" | "pi-client"
  runtimeStatus: RuntimeStatus
  updatedAt: string
  git: ProjectGitStatus
  workspaceAvailable: boolean
  subagentsInstalled: boolean
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <div className="mt-0.5 min-w-0 text-xs leading-5 text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  )
}

function InspectorContent({
  cwd,
  projectName,
  runtimeKind,
  runtimeStatus,
  updatedAt,
  git,
  workspaceAvailable,
  subagentsInstalled,
}: SessionInspectorProps) {
  const { locale, t } = useI18n()
  const changedFiles = git.available ? git.files : []

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="truncate text-sm font-medium">
          {t("session.inspector.title")}
        </p>
        <Badge
          variant={
            runtimeStatus === "crashed"
              ? "destructive"
              : runtimeStatus === "busy" || runtimeStatus === "starting"
                ? "secondary"
                : "outline"
          }
        >
          {statusLabel(t, runtimeStatus)}
        </Badge>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <DetailRow
          icon={FolderIcon}
          label={projectName ?? t("session.inspector.unnamedProject")}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <code className="font-mono text-[11px] break-all">{cwd}</code>
            <span>
              {workspaceAvailable
                ? t("session.inspector.localWorkspace")
                : t("session.inspector.readOnlyWorkspace")}
            </span>
          </div>
        </DetailRow>
        <DetailRow
          icon={SquareTerminalIcon}
          label={runtimeKind === "pi" ? "Pi" : "Pi Client"}
        >
          Runtime · {statusLabel(t, runtimeStatus)}
        </DetailRow>
        <DetailRow
          icon={Clock3Icon}
          label={t("session.inspector.recentlyUpdated")}
        >
          <time dateTime={updatedAt}>{formatTimestamp(updatedAt, locale)}</time>
        </DetailRow>
      </div>

      {subagentsInstalled ? (
        <>
          <Separator />
          <SubagentsSummary />
        </>
      ) : null}

      <Separator />
      <section
        className="flex min-w-0 flex-col gap-4"
        aria-label={t("session.inspector.gitStatus")}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium text-muted-foreground">Git</h3>
          {git.available ? (
            <Badge variant="outline">
              {t(
                changedFiles.length === 1
                  ? "session.inspector.changedCountOne"
                  : "session.inspector.changedCount",
                { count: changedFiles.length }
              )}
            </Badge>
          ) : null}
        </div>

        {!workspaceAvailable ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {t("session.inspector.workspaceUnavailable")}
          </p>
        ) : git.available ? (
          <>
            <DetailRow
              icon={GitBranchIcon}
              label={git.branch ?? t("project.git.detachedHead")}
            >
              {git.upstream ? (
                <span className="break-all">
                  {git.upstream} ·{" "}
                  {t("project.git.divergence", {
                    ahead: git.ahead,
                    behind: git.behind,
                  })}
                </span>
              ) : (
                <span>{t("session.inspector.noUpstream")}</span>
              )}
            </DetailRow>
            <DetailRow
              icon={GitCommitHorizontalIcon}
              label={git.commit ?? t("session.inspector.noCommit")}
            >
              <span className="break-all">{git.root}</span>
            </DetailRow>

            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <FileDiffIcon className="size-4" />
                {t("session.inspector.changedFiles")}
              </div>
              {changedFiles.length ? (
                <div className="flex min-w-0 flex-col gap-1">
                  {changedFiles.slice(0, 5).map((file) => (
                    <div
                      key={file.path}
                      className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/50"
                    >
                      <code className="font-mono text-[11px] text-muted-foreground">
                        {file.index === " " ? "·" : file.index}
                        {file.workingTree === " " ? "·" : file.workingTree}
                      </code>
                      <span className="truncate font-mono" title={file.path}>
                        {file.path}
                      </span>
                    </div>
                  ))}
                  {changedFiles.length > 5 ? (
                    <p className="px-2 text-xs text-muted-foreground">
                      {t(
                        changedFiles.length - 5 === 1
                          ? "session.inspector.moreChangesOne"
                          : "session.inspector.moreChanges",
                        { count: changedFiles.length - 5 }
                      )}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("session.inspector.clean")}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs leading-5 break-words text-muted-foreground">
            {git.error}
          </p>
        )}
      </section>
    </div>
  )
}

export function SessionInspector(props: SessionInspectorProps) {
  const { t } = useI18n()
  const runtimeStatus = useStreamingRuntimeStatus() ?? props.runtimeStatus

  return (
    <Sheet>
      <Tooltip>
        <SheetTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("session.inspector.title")}
            >
              <ListFilterIcon />
            </Button>
          </TooltipTrigger>
        </SheetTrigger>
        <TooltipContent side="bottom">
          {t("session.inspector.title")}
        </TooltipContent>
      </Tooltip>
      <SheetContent className="w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-y-auto p-0 sm:max-w-96">
        <SheetHeader className="sr-only">
          <SheetTitle>{t("session.inspector.title")}</SheetTitle>
          <SheetDescription>
            {t("session.inspector.description")}
          </SheetDescription>
        </SheetHeader>
        <InspectorContent {...props} runtimeStatus={runtimeStatus} />
      </SheetContent>
    </Sheet>
  )
}
