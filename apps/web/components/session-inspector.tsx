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
import { useStreamingRuntimeStatus } from "@/components/session-streaming-context"
import type { ProjectGitStatus } from "@/lib/project-git"
import { formatTimestamp } from "@/lib/session-display"

const STATUS_LABELS: Record<RuntimeStatus, string> = {
  stopped: "未激活",
  starting: "启动中",
  ready: "就绪",
  busy: "运行中",
  stopping: "停止中",
  crashed: "已崩溃",
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
  const changedFiles = git.available ? git.files : []

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="truncate text-sm font-medium">环境信息</h2>
        <Badge
          variant={
            runtimeStatus === "crashed"
              ? "destructive"
              : runtimeStatus === "busy" || runtimeStatus === "starting"
                ? "secondary"
                : "outline"
          }
        >
          {STATUS_LABELS[runtimeStatus]}
        </Badge>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <DetailRow icon={FolderIcon} label={projectName ?? "未命名项目"}>
          <div className="flex min-w-0 flex-col gap-1">
            <code className="font-mono text-[11px] break-all">{cwd}</code>
            <span>
              {workspaceAvailable ? "本地工作区" : "只读历史 · 目录不可用"}
            </span>
          </div>
        </DetailRow>
        <DetailRow
          icon={SquareTerminalIcon}
          label={runtimeKind === "pi" ? "Pi" : "Pi Client"}
        >
          Runtime · {STATUS_LABELS[runtimeStatus]}
        </DetailRow>
        <DetailRow icon={Clock3Icon} label="最近更新">
          <time dateTime={updatedAt}>{formatTimestamp(updatedAt)}</time>
        </DetailRow>
      </div>

      {subagentsInstalled ? (
        <>
          <Separator />
          <SubagentsSummary />
        </>
      ) : null}

      <Separator />
      <section className="flex min-w-0 flex-col gap-4" aria-label="Git 状态">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium text-muted-foreground">Git</h3>
          {git.available ? (
            <Badge variant="outline">{changedFiles.length} 个变更</Badge>
          ) : null}
        </div>

        {!workspaceAvailable ? (
          <p className="text-xs leading-5 text-muted-foreground">
            工作区目录不可用，无法读取 Files 或 Git。
          </p>
        ) : git.available ? (
          <>
            <DetailRow
              icon={GitBranchIcon}
              label={git.branch ?? "Detached HEAD"}
            >
              {git.upstream ? (
                <span className="break-all">
                  {git.upstream} · ahead {git.ahead} · behind {git.behind}
                </span>
              ) : (
                <span>没有 upstream</span>
              )}
            </DetailRow>
            <DetailRow
              icon={GitCommitHorizontalIcon}
              label={git.commit ?? "没有 commit"}
            >
              <span className="break-all">{git.root}</span>
            </DetailRow>

            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <FileDiffIcon className="size-4" />
                变更文件
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
                      另有 {changedFiles.length - 5} 个变更
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">工作区干净</p>
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
  const runtimeStatus = useStreamingRuntimeStatus() ?? props.runtimeStatus

  return (
    <Sheet>
      <Tooltip>
        <SheetTrigger asChild>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="环境信息">
              <ListFilterIcon />
            </Button>
          </TooltipTrigger>
        </SheetTrigger>
        <TooltipContent side="bottom">环境信息</TooltipContent>
      </Tooltip>
      <SheetContent className="w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-y-auto p-0 sm:max-w-96">
        <SheetHeader className="sr-only">
          <SheetTitle>环境信息</SheetTitle>
          <SheetDescription>
            查看当前项目的运行环境、子智能体与工作区状态。
          </SheetDescription>
        </SheetHeader>
        <InspectorContent {...props} runtimeStatus={runtimeStatus} />
      </SheetContent>
    </Sheet>
  )
}
