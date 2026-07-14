"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  Clock3Icon,
  FileDiffIcon,
  FolderIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  PanelRightOpenIcon,
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
  standalone: boolean
  cwd: string | null
  projectName: string | null
  runtimeKind: "pi" | "pi-client"
  runtimeStatus: RuntimeStatus
  updatedAt: string
  git: ProjectGitStatus | null
  workspaceAvailable: boolean
}

const RUNTIME_EVENT_STATUS: Partial<Record<string, RuntimeStatus>> = {
  "runtime.starting": "starting",
  "runtime.ready": "ready",
  "runtime.busy": "busy",
  "runtime.idle": "ready",
  "runtime.stopping": "stopping",
  "runtime.stopped": "stopped",
  "runtime.crashed": "crashed",
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
  standalone,
  cwd,
  projectName,
  runtimeKind,
  runtimeStatus,
  updatedAt,
  git,
  workspaceAvailable,
}: SessionInspectorProps) {
  const hasWorkspace = workspaceAvailable && cwd !== null
  const gitStatus = !standalone && hasWorkspace ? git : null
  const changedFiles = gitStatus?.available ? gitStatus.files : []

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
        <DetailRow
          icon={FolderIcon}
          label={standalone ? "独立任务" : (projectName ?? "未命名项目")}
        >
          {standalone ? (
            <span>未关联项目，不提供 Files 或 Git。</span>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              {cwd ? (
                <code className="font-mono text-[11px] break-all">{cwd}</code>
              ) : null}
              <span>
                {hasWorkspace ? "本地工作区" : "只读历史 · 目录不可用"}
              </span>
            </div>
          )}
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

      {!standalone ? (
        <>
          <Separator />
          <section
            className="flex min-w-0 flex-col gap-4"
            aria-label="Git 状态"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium text-muted-foreground">Git</h3>
              {gitStatus?.available ? (
                <Badge variant="outline">{changedFiles.length} 个变更</Badge>
              ) : null}
            </div>

            {!hasWorkspace ? (
              <p className="text-xs leading-5 text-muted-foreground">
                工作区目录不可用，无法读取 Files 或 Git。
              </p>
            ) : gitStatus === null ? (
              <p className="text-xs leading-5 text-muted-foreground">
                未提供 Git 状态。
              </p>
            ) : gitStatus.available ? (
              <>
                <DetailRow
                  icon={GitBranchIcon}
                  label={gitStatus.branch ?? "Detached HEAD"}
                >
                  {gitStatus.upstream ? (
                    <span className="break-all">
                      {gitStatus.upstream} · ahead {gitStatus.ahead} · behind{" "}
                      {gitStatus.behind}
                    </span>
                  ) : (
                    <span>没有 upstream</span>
                  )}
                </DetailRow>
                <DetailRow
                  icon={GitCommitHorizontalIcon}
                  label={gitStatus.commit ?? "没有 commit"}
                >
                  <span className="break-all">{gitStatus.root}</span>
                </DetailRow>

                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <FileDiffIcon className="size-4" />
                    变更文件
                  </div>
                  {changedFiles.length ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      {changedFiles.slice(0, 5).map((file, index) => (
                        <div
                          key={`${file.path}-${index}`}
                          className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/50"
                        >
                          <code className="font-mono text-[11px] text-muted-foreground">
                            {file.index === " " ? "·" : file.index}
                            {file.workingTree === " " ? "·" : file.workingTree}
                          </code>
                          <span
                            className="truncate font-mono"
                            title={file.path}
                          >
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
                {gitStatus.error}
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

export function SessionInspector({
  sessionId,
  ...props
}: SessionInspectorProps & { sessionId: string }) {
  const [runtimeStatus, setRuntimeStatus] = useState(props.runtimeStatus)

  useEffect(() => {
    const events = new EventSource(`/api/v1/events?sessionId=${sessionId}`)
    const update = (source: Event) => {
      const event = JSON.parse((source as MessageEvent<string>).data) as {
        type: string
      }
      const status = RUNTIME_EVENT_STATUS[event.type]
      if (status) setRuntimeStatus(status)
    }
    for (const type of Object.keys(RUNTIME_EVENT_STATUS)) {
      events.addEventListener(type, update)
    }
    return () => events.close()
  }, [sessionId])

  const liveProps = { ...props, runtimeStatus }
  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-72 shrink-0 p-3 xl:block">
        <div className="h-full min-w-0 overflow-y-auto rounded-2xl border bg-card shadow-sm">
          <InspectorContent {...liveProps} />
        </div>
      </aside>

      <div className="fixed top-14 right-3 z-20 xl:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="bg-background/95 shadow-sm backdrop-blur"
              aria-label="打开任务信息"
            >
              <PanelRightOpenIcon />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(22rem,calc(100vw-1rem))] gap-0 overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>任务信息</SheetTitle>
              <SheetDescription>
                查看当前任务的运行环境与工作区状态。
              </SheetDescription>
            </SheetHeader>
            <InspectorContent {...liveProps} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
