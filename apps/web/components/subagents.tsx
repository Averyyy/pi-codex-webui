"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import Link from "next/link"
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

import { useI18n } from "@/components/i18n-provider"
import { useSessionEvents } from "@/components/session-streaming-context"
import type { Locale, Translator } from "@/lib/i18n"

const EMPTY_SNAPSHOT: SubagentsSnapshot = {
  version: 1,
  revision: 0,
  available: false,
  agents: [],
  sessions: [],
}

const ACTIVE_STATUSES = new Set<SubagentStatus>(["queued", "running"])
const COMPLETED_STATUSES = new Set<SubagentStatus>(["completed", "steered"])

const STATUS_METADATA: Record<
  SubagentStatus,
  {
    icon: LucideIcon
    iconClassName?: string
    badge: "outline" | "secondary" | "destructive"
  }
> = {
  queued: {
    icon: Clock3Icon,
    badge: "outline",
  },
  running: {
    icon: LoaderCircleIcon,
    iconClassName: "animate-spin motion-reduce:animate-none",
    badge: "secondary",
  },
  completed: {
    icon: CircleCheckIcon,
    badge: "outline",
  },
  steered: {
    icon: CircleCheckIcon,
    badge: "outline",
  },
  aborted: {
    icon: OctagonAlertIcon,
    iconClassName: "text-destructive",
    badge: "destructive",
  },
  stopped: {
    icon: SquareIcon,
    badge: "outline",
  },
  error: {
    icon: CircleXIcon,
    iconClassName: "text-destructive",
    badge: "destructive",
  },
}

function statusLabel(t: Translator, status: SubagentStatus) {
  const keys = {
    queued: "session.subagents.status.queued",
    running: "session.subagents.status.running",
    completed: "session.subagents.status.completed",
    steered: "session.subagents.status.steered",
    aborted: "session.subagents.status.aborted",
    stopped: "session.subagents.status.stopped",
    error: "session.subagents.status.error",
  } as const
  return t(keys[status])
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

async function responseError(response: Response, t: Translator) {
  const body = (await response.json()) as { error?: string }
  return new Error(
    body.error ??
      t("session.subagents.requestFailed", { status: response.status })
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
  const { t } = useI18n()
  const sessionEvents = useSessionEvents()
  const [snapshotState, setSnapshotState] = useState({
    sessionId,
    snapshot: EMPTY_SNAPSHOT,
  })
  const snapshot =
    installed && snapshotState.sessionId === sessionId
      ? snapshotState.snapshot
      : EMPTY_SNAPSHOT
  const acceptSnapshot = useCallback(
    (next: SubagentsSnapshot, preserveSessions = false) => {
      setSnapshotState((current) => {
        const currentRevision =
          current.sessionId === sessionId ? current.snapshot.revision : 0
        const sessions =
          preserveSessions && next.sessions.length === 0
            ? current.snapshot.sessions
            : next.sessions
        return next.revision >= currentRevision
          ? { sessionId, snapshot: { ...next, sessions } }
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
      if (!response.ok) throw await responseError(response, t)
      const next = subagentsSnapshotSchema.parse(await response.json())
      if (!disposed && requestedGeneration === generation) acceptSnapshot(next)
    }
    const refresh = () => {
      void load().catch((error: Error) => toast.error(error.message))
    }
    const update = (source: Event) => {
      const event = JSON.parse((source as MessageEvent<string>).data) as {
        payload: unknown
      }
      acceptSnapshot(subagentsSnapshotSchema.parse(event.payload), true)
      refresh()
    }
    const clear = () => {
      generation += 1
      setSnapshotState({ sessionId, snapshot: EMPTY_SNAPSHOT })
      refresh()
    }

    const unsubscribeUpdates = sessionEvents.subscribe(
      ["subagents.updated"],
      update
    )
    const unsubscribeRefresh = sessionEvents.subscribe(
      ["runtime.ready", "resync.required"],
      refresh
    )
    const unsubscribeClear = sessionEvents.subscribe(
      [
        "runtime.starting",
        "runtime.stopping",
        "runtime.stopped",
        "runtime.crashed",
      ],
      clear
    )
    refresh()

    return () => {
      disposed = true
      unsubscribeUpdates()
      unsubscribeRefresh()
      unsubscribeClear()
    }
  }, [acceptSnapshot, installed, sessionEvents, sessionId, t])

  const stop = useCallback(
    async (agentId: string) => {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/subagents/${encodeURIComponent(agentId)}/stop`,
        {
          method: "POST",
          headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
        }
      )
      if (!response.ok) throw await responseError(response, t)
    },
    [mutationToken, sessionId, t]
  )

  const value = useMemo(() => ({ snapshot, stop }), [snapshot, stop])
  return (
    <SubagentsContext.Provider value={value}>
      {children}
    </SubagentsContext.Provider>
  )
}

function formatDuration(durationMs: number, locale: Locale, t: Translator) {
  const milliseconds = Math.round(durationMs)
  if (durationMs < 1_000) {
    return t("session.subagents.durationMilliseconds", {
      count: milliseconds.toLocaleString(locale),
    })
  }
  const seconds = Math.round(durationMs / 1_000)
  if (durationMs < 60_000) {
    return t(
      seconds === 1
        ? "session.subagents.durationSecondsOne"
        : "session.subagents.durationSeconds",
      { count: seconds.toLocaleString(locale) }
    )
  }
  const minutes = Math.round(durationMs / 60_000)
  return t(
    minutes === 1
      ? "session.subagents.durationMinutesOne"
      : "session.subagents.durationMinutes",
    { count: minutes.toLocaleString(locale) }
  )
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
  const { locale, t } = useI18n()
  const metadata = STATUS_METADATA[agent.status]
  const StatusIcon = metadata.icon
  const active = ACTIVE_STATUSES.has(agent.status)
  const metrics = [
    agent.toolUses
      ? t(
          agent.toolUses === 1
            ? "session.subagents.toolUsesOne"
            : "session.subagents.toolUses",
          { count: agent.toolUses.toLocaleString(locale) }
        )
      : null,
    agent.tokens
      ? t(
          agent.tokens.total === 1
            ? "session.subagents.tokensOne"
            : "session.subagents.tokens",
          { count: agent.tokens.total.toLocaleString(locale) }
        )
      : null,
    agent.durationMs === undefined
      ? null
      : formatDuration(agent.durationMs, locale, t),
    agent.compactionCount
      ? t(
          agent.compactionCount === 1
            ? "session.subagents.compactionsOne"
            : "session.subagents.compactions",
          { count: agent.compactionCount.toLocaleString(locale) }
        )
      : null,
  ].filter(Boolean)
  const description = agent.description || t("session.subagents.noDescription")

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
            <Badge variant={metadata.badge}>
              {statusLabel(t, agent.status)}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-5 font-medium break-words">
            {description}
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
            aria-label={t("session.subagents.stopAria", { description })}
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
            {t("session.subagents.stop")}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

export function SubagentsPanel() {
  const { t } = useI18n()
  const { snapshot, stop } = useSubagents()
  const [stoppingIds, setStoppingIds] = useState(() => new Set<string>())
  const stoppingIdsRef = useRef(new Set<string>())
  const activeCount = snapshot.agents.filter((agent) =>
    ACTIVE_STATUSES.has(agent.status)
  ).length

  function stopAgent(agent: SubagentRecord) {
    if (stoppingIdsRef.current.has(agent.id)) return
    stoppingIdsRef.current.add(agent.id)
    setStoppingIds(new Set(stoppingIdsRef.current))
    void stop(agent.id)
      .catch((error: Error) => toast.error(error.message))
      .finally(() => {
        stoppingIdsRef.current.delete(agent.id)
        setStoppingIds(new Set(stoppingIdsRef.current))
      })
  }

  if (!snapshot.available && !snapshot.sessions.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          </EmptyMedia>
          <EmptyTitle>{t("session.subagents.connecting")}</EmptyTitle>
          <EmptyDescription>
            {t("session.subagents.connectingDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!snapshot.agents.length) {
    if (snapshot.sessions.length) {
      return (
        <div className="size-full overflow-auto">
          <SubagentSessions sessions={snapshot.sessions} />
        </div>
      )
    }
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BotIcon />
          </EmptyMedia>
          <EmptyTitle>{t("session.subagents.empty")}</EmptyTitle>
          <EmptyDescription>
            {t("session.subagents.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex size-full min-h-0 flex-col" aria-live="polite">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">
            {t("session.subagents.activity")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              activeCount === 1
                ? "session.subagents.activeCountOne"
                : "session.subagents.activeCount",
              { count: activeCount }
            )}{" "}
            ·{" "}
            {t(
              snapshot.agents.length - activeCount === 1
                ? "session.subagents.endedCountOne"
                : "session.subagents.endedCount",
              { count: snapshot.agents.length - activeCount }
            )}
          </p>
        </div>
        {activeCount ? (
          <Badge variant="secondary">{t("session.subagents.live")}</Badge>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul className="grid gap-2 p-3">
          {snapshot.agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              stopping={stoppingIds.has(agent.id)}
              onStop={() => stopAgent(agent)}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}

function SubagentSessions({
  sessions,
}: {
  sessions: SubagentsSnapshot["sessions"]
}) {
  const { t } = useI18n()
  return (
    <section className="border-t p-3">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">
        {t("session.subagents.title")}
      </h3>
      <ul className="grid gap-1.5">
        {sessions.map((session) => (
          <li key={session.id} className="rounded-md border px-3 py-2">
            <Link
              href={
                session.projectId === null
                  ? `/tasks/${session.id}`
                  : `/projects/${session.projectId}/sessions/${session.id}`
              }
              className="block min-w-0 hover:underline"
            >
              <span className="block truncate text-sm font-medium">
                {session.title || session.firstMessage || session.id}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t("project.sessions.messageCount", {
                  count: session.messageCount.toLocaleString(),
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SubagentsSummary() {
  const { t } = useI18n()
  const { snapshot } = useSubagents()
  const active = snapshot.agents.filter((agent) =>
    ACTIVE_STATUSES.has(agent.status)
  )
  const completed = snapshot.agents.filter((agent) =>
    COMPLETED_STATUSES.has(agent.status)
  ).length
  const issues = snapshot.agents.length - active.length - completed

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-label={t("session.subagents.title")}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t("session.subagents.title")}
        </h3>
        {active.length ? (
          <Badge variant="secondary">{t("session.subagents.live")}</Badge>
        ) : null}
      </div>
      <div className="rounded-xl bg-muted/60 px-3 py-2.5">
        {!snapshot.available ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            {t("session.subagents.waitingForRuntime")}
          </div>
        ) : !snapshot.agents.length ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BotIcon className="size-4" />
            {t("session.subagents.noActivity")}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {active.length ? (
                <span className="inline-flex items-center gap-1.5">
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  {t(
                    active.length === 1
                      ? "session.subagents.activeCountOne"
                      : "session.subagents.activeCount",
                    { count: active.length }
                  )}
                </span>
              ) : null}
              {completed ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CircleCheckIcon className="size-4" />
                  {t(
                    completed === 1
                      ? "session.subagents.completedCountOne"
                      : "session.subagents.completedCount",
                    { count: completed }
                  )}
                </span>
              ) : null}
              {issues ? (
                <span className="inline-flex items-center gap-1.5 text-destructive">
                  <CircleXIcon className="size-4" />
                  {t(
                    issues === 1
                      ? "session.subagents.issueCountOne"
                      : "session.subagents.issueCount",
                    { count: issues }
                  )}
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
