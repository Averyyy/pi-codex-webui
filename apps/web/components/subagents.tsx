"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  BotIcon,
  CircleCheckIcon,
  CircleXIcon,
  Clock3Icon,
  LoaderCircleIcon,
  OctagonAlertIcon,
  SquareIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  subagentsSnapshotSchema,
  type SubagentRecord,
  type SubagentStatus,
  type SubagentsSnapshot,
} from "@workspace/runtime-protocol"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

const EMPTY_SNAPSHOT: SubagentsSnapshot = {
  version: 1,
  revision: 0,
  available: false,
  agents: [],
}

const ACTIVE_STATUSES = new Set<SubagentStatus>(["queued", "running"])
const COMPLETED_STATUSES = new Set<SubagentStatus>(["completed", "steered"])

const STATUS_METADATA: Record<
  SubagentStatus,
  {
    label: string
    icon: LucideIcon
    iconClassName?: string
    badge: "outline" | "secondary" | "destructive"
  }
> = {
  queued: {
    label: "排队中",
    icon: Clock3Icon,
    badge: "outline",
  },
  running: {
    label: "运行中",
    icon: LoaderCircleIcon,
    iconClassName: "animate-spin motion-reduce:animate-none",
    badge: "secondary",
  },
  completed: {
    label: "已完成",
    icon: CircleCheckIcon,
    badge: "outline",
  },
  steered: {
    label: "已收尾",
    icon: CircleCheckIcon,
    badge: "outline",
  },
  aborted: {
    label: "达到轮次上限",
    icon: OctagonAlertIcon,
    iconClassName: "text-destructive",
    badge: "destructive",
  },
  stopped: {
    label: "已停止",
    icon: SquareIcon,
    badge: "outline",
  },
  error: {
    label: "错误",
    icon: CircleXIcon,
    iconClassName: "text-destructive",
    badge: "destructive",
  },
}

interface SubagentsContextValue {
  snapshot: SubagentsSnapshot
  stop: (agentId: string) => Promise<void>
}

const SubagentsContext = createContext<SubagentsContextValue | null>(null)

function useSubagents() {
  const value = useContext(SubagentsContext)
  if (!value) throw new Error("SubagentsProvider is missing.")
  return value
}

async function responseError(response: Response) {
  const body = (await response.json()) as { error?: string }
  return new Error(
    body.error ?? `Subagent request failed (${response.status}).`
  )
}

export function SubagentsProvider({
  sessionId,
  mutationToken,
  installed,
  children,
}: {
  sessionId: string
  mutationToken: string
  installed: boolean
  children: ReactNode
}) {
  const [snapshotState, setSnapshotState] = useState({
    sessionId,
    snapshot: EMPTY_SNAPSHOT,
  })
  const snapshot =
    installed && snapshotState.sessionId === sessionId
      ? snapshotState.snapshot
      : EMPTY_SNAPSHOT
  const acceptSnapshot = useCallback(
    (next: SubagentsSnapshot) => {
      setSnapshotState((current) => {
        const currentRevision =
          current.sessionId === sessionId ? current.snapshot.revision : 0
        return next.revision >= currentRevision
          ? { sessionId, snapshot: next }
          : current
      })
    },
    [sessionId]
  )

  useEffect(() => {
    if (!installed) return

    let disposed = false
    let generation = 0
    const load = async () => {
      const requestedGeneration = generation
      const response = await fetch(`/api/v1/sessions/${sessionId}/subagents`, {
        cache: "no-store",
      })
      if (!response.ok) throw await responseError(response)
      const next = subagentsSnapshotSchema.parse(await response.json())
      if (!disposed && requestedGeneration === generation) acceptSnapshot(next)
    }
    const refresh = () => {
      void load().catch((error: Error) => toast.error(error.message))
    }
    const events = new EventSource(`/api/v1/events?sessionId=${sessionId}`)
    const update = (source: Event) => {
      const event = JSON.parse((source as MessageEvent<string>).data) as {
        payload: unknown
      }
      acceptSnapshot(subagentsSnapshotSchema.parse(event.payload))
    }
    const clear = () => {
      generation += 1
      setSnapshotState({ sessionId, snapshot: EMPTY_SNAPSHOT })
    }

    events.addEventListener("subagents.updated", update)
    events.addEventListener("runtime.ready", refresh)
    events.addEventListener("resync.required", refresh)
    for (const type of [
      "runtime.starting",
      "runtime.stopping",
      "runtime.stopped",
      "runtime.crashed",
    ]) {
      events.addEventListener(type, clear)
    }
    refresh()

    return () => {
      disposed = true
      events.close()
    }
  }, [acceptSnapshot, installed, sessionId])

  const stop = useCallback(
    async (agentId: string) => {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/subagents/${encodeURIComponent(agentId)}/stop`,
        {
          method: "POST",
          headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
        }
      )
      if (!response.ok) throw await responseError(response)
    },
    [mutationToken, sessionId]
  )

  const value = useMemo(() => ({ snapshot, stop }), [snapshot, stop])
  return (
    <SubagentsContext.Provider value={value}>
      {children}
    </SubagentsContext.Provider>
  )
}

function formatDuration(durationMs: number) {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`
  if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)} 秒`
  return `${Math.round(durationMs / 60_000)} 分钟`
}

function AgentRow({
  agent,
  stopping,
  onStop,
}: {
  agent: SubagentRecord
  stopping: boolean
  onStop: () => void
}) {
  const metadata = STATUS_METADATA[agent.status]
  const StatusIcon = metadata.icon
  const active = ACTIVE_STATUSES.has(agent.status)
  const metrics = [
    agent.toolUses ? `${agent.toolUses} 次工具调用` : null,
    agent.tokens
      ? `${agent.tokens.total.toLocaleString("zh-CN")} tokens`
      : null,
    agent.durationMs === undefined ? null : formatDuration(agent.durationMs),
    agent.compactionCount ? `${agent.compactionCount} 次压缩` : null,
  ].filter(Boolean)

  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <StatusIcon
            className={cn("size-4", metadata.iconClassName)}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge variant="outline">{agent.type}</Badge>
            <Badge variant={metadata.badge}>{metadata.label}</Badge>
          </div>
          <p className="mt-2 text-sm leading-5 font-medium break-words">
            {agent.description || "未提供任务描述"}
          </p>
          {metrics.length ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {metrics.join(" · ")}
            </p>
          ) : null}
          {agent.error ? (
            <p className="mt-2 text-xs leading-5 break-words text-destructive">
              {agent.error}
            </p>
          ) : null}
          <code className="mt-2 block truncate font-mono text-[10px] text-muted-foreground/80">
            {agent.id}
          </code>
        </div>
        {active ? (
          <Button
            variant="outline"
            size="xs"
            disabled={stopping}
            aria-label={`停止子智能体 ${agent.description}`}
            onClick={onStop}
          >
            {stopping ? (
              <LoaderCircleIcon
                className="animate-spin motion-reduce:animate-none"
                data-icon="inline-start"
              />
            ) : (
              <SquareIcon data-icon="inline-start" />
            )}
            停止
          </Button>
        ) : null}
      </div>
    </li>
  )
}

export function SubagentsPanel() {
  const { snapshot, stop } = useSubagents()
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const activeCount = snapshot.agents.filter((agent) =>
    ACTIVE_STATUSES.has(agent.status)
  ).length

  function stopAgent(agent: SubagentRecord) {
    setStoppingId(agent.id)
    void stop(agent.id)
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setStoppingId(null))
  }

  if (!snapshot.available) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          </EmptyMedia>
          <EmptyTitle>正在连接子智能体</EmptyTitle>
          <EmptyDescription>
            Pi Runtime 启动后，这里会显示 @tintinweb/pi-subagents 的实时状态。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!snapshot.agents.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BotIcon />
          </EmptyMedia>
          <EmptyTitle>暂无子智能体</EmptyTitle>
          <EmptyDescription>
            通过 Pi 创建子智能体后，状态会实时出现在这里。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex size-full min-h-0 flex-col" aria-live="polite">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">子智能体活动</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {activeCount} 运行中 · {snapshot.agents.length - activeCount} 已结束
          </p>
        </div>
        {activeCount ? <Badge variant="secondary">实时</Badge> : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="grid gap-2 p-3">
          {snapshot.agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              stopping={stoppingId === agent.id}
              onStop={() => stopAgent(agent)}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}

export function SubagentsSummary() {
  const { snapshot } = useSubagents()
  const active = snapshot.agents.filter((agent) =>
    ACTIVE_STATUSES.has(agent.status)
  )
  const completed = snapshot.agents.filter((agent) =>
    COMPLETED_STATUSES.has(agent.status)
  ).length
  const issues = snapshot.agents.length - active.length - completed

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="子智能体">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">子智能体</h3>
        {active.length ? <Badge variant="secondary">实时</Badge> : null}
      </div>
      <div className="rounded-xl bg-muted/60 px-3 py-2.5">
        {!snapshot.available ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            等待 Pi Runtime
          </div>
        ) : !snapshot.agents.length ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BotIcon className="size-4" />
            暂无活动
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {active.length ? (
                <span className="inline-flex items-center gap-1.5">
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  {active.length} 运行中
                </span>
              ) : null}
              {completed ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CircleCheckIcon className="size-4" />
                  {completed} 完成
                </span>
              ) : null}
              {issues ? (
                <span className="inline-flex items-center gap-1.5 text-destructive">
                  <CircleXIcon className="size-4" />
                  {issues} 异常
                </span>
              ) : null}
            </div>
            {active[0] ? (
              <p className="mt-2 truncate text-xs text-muted-foreground">
                {active[0].description}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
