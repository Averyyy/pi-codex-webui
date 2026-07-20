"use client"

import {
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react"
import {
  ChevronDownIcon,
  CirclePauseIcon,
  CirclePlayIcon,
  PencilIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

import { SessionExtensionContext } from "@/components/session-extension-provider"
import {
  piGoalStateSchema,
  type PiGoalState,
  type PiGoalStatus,
} from "@/lib/pi-goal"

export type GoalCommand =
  | { command: "pause" | "resume" | "clear" }
  | { command: "edit"; objective: string; tokenBudget?: number }

const STATUS_LABELS: Record<PiGoalStatus, string> = {
  active: "进行中的目标",
  queued: "排队中的目标",
  paused: "已暂停的目标",
  blocked: "受阻的目标",
  usage_limited: "用量受限的目标",
  budget_limited: "预算已用尽的目标",
  complete: "已完成的目标",
}

function duration(state: PiGoalState, now: number) {
  const live =
    state.goal.status === "active" && state.goal.activeStartedAt
      ? Math.max(0, now - state.goal.activeStartedAt) / 1_000
      : 0
  let seconds = Math.max(
    0,
    Math.floor(state.goal.timeUsedSeconds + live)
  )
  const days = Math.floor(seconds / 86_400)
  seconds %= 86_400
  const hours = Math.floor(seconds / 3_600)
  seconds %= 3_600
  const minutes = Math.floor(seconds / 60)
  seconds %= 60
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}m` : "",
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(" ")
}

function formatTokens(value: number) {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${Number((value / 1_000).toFixed(1))}k`
  return `${Number((value / 1_000_000).toFixed(1))}m`
}

function commandArgs(input: GoalCommand) {
  if (input.command !== "edit") return input.command
  const budget = input.tokenBudget ? ` --tokens ${input.tokenBudget}` : ""
  return `edit${budget} ${input.objective.trim()}`
}

export function GoalStatusBar({
  initialState,
  disabled,
  onCommand,
}: {
  initialState: PiGoalState | null
  disabled: boolean
  onCommand(args: string): Promise<boolean>
}) {
  const extensions = useContext(SessionExtensionContext)
  if (!extensions) {
    throw new Error("GoalStatusBar requires SessionExtensionProvider.")
  }
  const extensionRuntime = extensions
  const liveView = extensions.views.find(
    (view) => view.viewId === "goal.card"
  )
  const liveState = useMemo(
    () => (liveView ? piGoalStateSchema.safeParse(liveView.state) : null),
    [liveView]
  )
  const [state, setState] = useState<PiGoalState | null>(initialState)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(0)
  const [previousLiveState, setPreviousLiveState] = useState(liveState)

  if (liveState !== previousLiveState) {
    setPreviousLiveState(liveState)
    if (liveState?.success) setState(liveState.data)
  }

  useEffect(() => {
    if (state?.goal.status !== "active") return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [state?.goal.status])

  if (!state) return null

  async function run(input: GoalCommand) {
    setPending(true)
    setError("")
    try {
      const accepted = liveView
        ? ((await extensionRuntime.invoke(liveView, "goal.command", input)),
          true)
        : await onCommand(commandArgs(input))
      if (!accepted) return
      setState((current) => {
        if (!current || input.command === "clear") return null
        if (input.command === "pause") {
          const liveSeconds = current.goal.activeStartedAt
            ? Math.max(0, Date.now() - current.goal.activeStartedAt) / 1_000
            : 0
          return {
            ...current,
            goal: {
              ...current.goal,
              status: "paused",
              activeStartedAt: undefined,
              timeUsedSeconds: current.goal.timeUsedSeconds + liveSeconds,
            },
          }
        }
        if (input.command === "resume") {
          return {
            ...current,
            goal: {
              ...current.goal,
              status: "active",
              activeStartedAt: Date.now(),
            },
          }
        }
        if (input.command !== "edit") return current
        return {
          ...current,
          goal: {
            ...current.goal,
            text: input.objective.trim(),
            tokenBudget: input.tokenBudget,
          },
        }
      })
      if (input.command === "edit") setEditing(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setPending(false)
    }
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const objective = String(form.get("objective") ?? "").trim()
    if (!objective) return
    const budget = String(form.get("tokenBudget") ?? "")
    void run({
      command: "edit",
      objective,
      tokenBudget: budget ? Number(budget) : undefined,
    })
  }

  const actionDisabled = disabled || pending
  return (
    <section className="overflow-hidden rounded-2xl border bg-background/95 shadow-sm">
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        <TargetIcon className="size-5 shrink-0 text-muted-foreground" />
        <strong className="shrink-0 text-sm font-semibold">
          {STATUS_LABELS[state.goal.status]}
        </strong>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {state.goal.text}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {duration(state, now)}
        </span>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="编辑目标"
            title="编辑目标"
            disabled={actionDisabled}
            onClick={() => {
              setExpanded(true)
              setEditing((current) => !current)
            }}
          >
            <PencilIcon />
          </Button>
          {state.goal.status === "active" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="暂停目标"
              title="暂停目标"
              disabled={actionDisabled}
              onClick={() => void run({ command: "pause" })}
            >
              <CirclePauseIcon />
            </Button>
          ) : ["paused", "blocked", "usage_limited", "budget_limited"].includes(
              state.goal.status
            ) ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="恢复目标"
              title="恢复目标"
              disabled={actionDisabled}
              onClick={() => void run({ command: "resume" })}
            >
              <CirclePlayIcon />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="清除目标"
            title="清除目标"
            disabled={actionDisabled}
            onClick={() => void run({ command: "clear" })}
          >
            <Trash2Icon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={expanded ? "收起目标" : "展开目标"}
            title={expanded ? "收起目标" : "展开目标"}
            onClick={() => {
              setExpanded((current) => !current)
              if (expanded) setEditing(false)
            }}
          >
            <ChevronDownIcon
              className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
            />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t px-4 pb-4 pl-10">
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {state.goal.text}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>第 {state.goal.iteration + 1} 轮</span>
            <span>已用 {formatTokens(state.goal.tokensUsed)} tokens</span>
            {state.goal.tokenBudget ? (
              <span>预算 {formatTokens(state.goal.tokenBudget)}</span>
            ) : null}
            {state.queue.length ? <span>队列 {state.queue.length}</span> : null}
          </div>
          {editing ? (
            <form className="mt-3 grid gap-2" onSubmit={submitEdit}>
              <Textarea
                name="objective"
                aria-label="目标内容"
                defaultValue={state.goal.text}
                maxLength={4_000}
                required
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Input
                  name="tokenBudget"
                  aria-label="Token 预算"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={state.goal.tokenBudget}
                  placeholder="Token 预算（可选）"
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={actionDisabled}>
                  保存
                </Button>
              </div>
            </form>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
