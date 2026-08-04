"use client"

import { useContext, useEffect, useMemo, useState, type FormEvent } from "react"
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
import { useI18n } from "@/components/i18n-provider"
import type { Translator } from "@/lib/i18n"
import {
  resolvePiGoalState,
  type PiGoalState,
  type PiGoalStatus,
} from "@/lib/pi-goal"

export type GoalCommand =
  | { command: "pause" | "resume" | "clear" }
  | { command: "edit"; objective: string; tokenBudget?: number }

function statusLabel(t: Translator, status: PiGoalStatus) {
  const keys = {
    active: "session.goal.status.active",
    queued: "session.goal.status.queued",
    paused: "session.goal.status.paused",
    blocked: "session.goal.status.blocked",
    usage_limited: "session.goal.status.usageLimited",
    budget_limited: "session.goal.status.budgetLimited",
    complete: "session.goal.status.complete",
  } as const
  return t(keys[status])
}

function duration(state: PiGoalState, now: number) {
  const live =
    state.goal.status === "active" && state.goal.activeStartedAt
      ? Math.max(0, now - state.goal.activeStartedAt) / 1_000
      : 0
  let seconds = Math.max(0, Math.floor(state.goal.timeUsedSeconds + live))
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
  const { t } = useI18n()
  const extensions = useContext(SessionExtensionContext)
  if (!extensions) {
    throw new Error("GoalStatusBar requires SessionExtensionProvider.")
  }
  const extensionRuntime = extensions
  const liveView = extensions.views.find((view) => view.viewId === "goal.card")
  const sourceState = useMemo(
    () => resolvePiGoalState(initialState, liveView),
    [initialState, liveView]
  )
  const [state, setState] = useState<PiGoalState | null>(sourceState)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(0)
  const [previousSourceState, setPreviousSourceState] = useState(sourceState)

  if (sourceState !== previousSourceState) {
    setPreviousSourceState(sourceState)
    setState(sourceState)
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
        ? (await extensionRuntime.invoke(liveView, "goal.command", input), true)
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
          {statusLabel(t, state.goal.status)}
        </strong>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {state.goal.text}
        </span>
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {duration(state, now)}
        </span>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("session.goal.edit")}
            title={t("session.goal.edit")}
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
              aria-label={t("session.goal.pause")}
              title={t("session.goal.pause")}
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
              aria-label={t("session.goal.resume")}
              title={t("session.goal.resume")}
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
            aria-label={t("session.goal.clear")}
            title={t("session.goal.clear")}
            disabled={actionDisabled}
            onClick={() => void run({ command: "clear" })}
          >
            <Trash2Icon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              expanded ? t("session.goal.collapse") : t("session.goal.expand")
            }
            title={
              expanded ? t("session.goal.collapse") : t("session.goal.expand")
            }
            onClick={() => {
              setExpanded((current) => !current)
              if (expanded) setEditing(false)
            }}
          >
            <ChevronDownIcon
              className={
                expanded
                  ? "rotate-180 transition-transform"
                  : "transition-transform"
              }
            />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t px-4 pb-4 pl-10">
          <p className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">
            {state.goal.text}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t("session.goal.iteration", {
                count: state.goal.iteration + 1,
              })}
            </span>
            <span>
              {t("session.goal.tokensUsed", {
                count: formatTokens(state.goal.tokensUsed),
              })}
            </span>
            {state.goal.tokenBudget ? (
              <span>
                {t("session.goal.budget", {
                  count: formatTokens(state.goal.tokenBudget),
                })}
              </span>
            ) : null}
            {state.queue.length ? (
              <span>
                {t("session.goal.queue", { count: state.queue.length })}
              </span>
            ) : null}
          </div>
          {editing ? (
            <form className="mt-3 grid gap-2" onSubmit={submitEdit}>
              <Textarea
                name="objective"
                aria-label={t("session.goal.objective")}
                defaultValue={state.goal.text}
                maxLength={4_000}
                required
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Input
                  name="tokenBudget"
                  aria-label={t("session.goal.tokenBudget")}
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={state.goal.tokenBudget}
                  placeholder={t("session.goal.tokenBudgetOptional")}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  {t("session.goal.cancel")}
                </Button>
                <Button type="submit" disabled={actionDisabled}>
                  {t("session.goal.save")}
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
