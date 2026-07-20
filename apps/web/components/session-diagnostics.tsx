"use client"

import { useEffect, useState } from "react"
import { ActivityIcon, LoaderCircleIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

import type {
  ProtocolEvent,
  RuntimeDiagnostics,
} from "@/lib/runtime-diagnostics"

async function loadDiagnostics(sessionId: string) {
  const response = await fetch(`/api/v1/sessions/${sessionId}/diagnostics`, {
    cache: "no-store",
  })
  const result = (await response.json()) as RuntimeDiagnostics & {
    error?: string
  }
  if (!response.ok) {
    throw new Error(result.error ?? "加载 runtime 诊断失败。")
  }
  return result
}

function nextStatus(
  current: RuntimeDiagnostics,
  event: ProtocolEvent
): RuntimeDiagnostics {
  const status =
    event.type === "runtime.starting"
      ? "starting"
      : event.type === "runtime.ready" || event.type === "runtime.idle"
        ? "ready"
        : event.type === "runtime.busy"
          ? "busy"
          : event.type === "runtime.stopping"
            ? "stopping"
            : event.type === "runtime.stopped"
              ? "stopped"
              : event.type === "runtime.crashed"
                ? "crashed"
                : current.status
  const active = ["starting", "ready", "busy", "stopping"].includes(status)
  const terminated = status === "stopped" || status === "crashed"
  return {
    ...current,
    status,
    active,
    pid: terminated ? null : current.pid,
    startedAt: terminated ? null : current.startedAt,
    pendingRequests: terminated ? 0 : current.pendingRequests,
    activeMcpCalls: terminated ? 0 : current.activeMcpCalls,
    activeTools: terminated ? [] : current.activeTools,
    crash:
      event.type === "runtime.crashed"
        ? (event.payload as RuntimeDiagnostics["crash"])
        : current.crash,
    events: [...current.events, event].slice(-100),
  }
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function SessionDiagnostics({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(
    null
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    let loaded = false
    let pendingEvents: ProtocolEvent[] = []
    void loadDiagnostics(sessionId).then(
      (result) => {
        if (!active) return
        loaded = true
        setDiagnostics(pendingEvents.reduce(nextStatus, result))
        pendingEvents = []
      },
      (failure: unknown) => {
        if (active) {
          loaded = true
          setLoadError(
            failure instanceof Error ? failure.message : String(failure)
          )
        }
      }
    )

    const events = new EventSource(
      `/api/v1/events?sessionId=${sessionId}&inspect=1`
    )
    events.addEventListener("protocol.event", (source) => {
      const event = JSON.parse(
        (source as MessageEvent<string>).data
      ) as ProtocolEvent
      if (!loaded) {
        pendingEvents.push(event)
        return
      }
      setDiagnostics((current) =>
        current ? nextStatus(current, event) : current
      )
    })
    events.onerror = () =>
      setConnectionError("协议事件连接已断开，正在自动重连。")
    events.onopen = () => setConnectionError(null)
    return () => {
      active = false
      events.close()
    }
  }, [open, sessionId])

  const error = loadError ?? connectionError

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDiagnostics(null)
      setLoadError(null)
      setConnectionError(null)
    }
    setOpen(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Runtime 诊断">
          <ActivityIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Runtime 诊断与协议检查器</DialogTitle>
          <DialogDescription>
            直接读取 Host 管理的 Worker 状态和最近 100 条 Domain Protocol 事件。
          </DialogDescription>
        </DialogHeader>

        {!diagnostics && !error ? (
          <div className="grid min-h-40 place-items-center">
            <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {diagnostics ? (
          <div className="grid min-h-0 gap-5 overflow-y-auto pr-1">
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Runtime</h3>
                <Badge
                  variant={
                    diagnostics.status === "crashed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {diagnostics.status}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border p-4 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">PID</dt>
                  <dd className="mt-1 font-mono">{diagnostics.pid ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Runtime</dt>
                  <dd className="mt-1">{diagnostics.runtimeKind ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Profile</dt>
                  <dd
                    className="mt-1 truncate"
                    title={diagnostics.runtimeProfileId ?? ""}
                  >
                    {diagnostics.runtimeProfileId ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pending IPC</dt>
                  <dd className="mt-1 tabular-nums">
                    {diagnostics.pendingRequests}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Active MCP</dt>
                  <dd className="mt-1 tabular-nums">
                    {diagnostics.activeMcpCalls}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Active tools</dt>
                  <dd className="mt-1 tabular-nums">
                    {diagnostics.activeTools.length}
                  </dd>
                </div>
              </dl>
              {diagnostics.crash ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs">
                  <p className="font-medium text-destructive">最近一次崩溃</p>
                  <p className="mt-2 break-words">
                    {diagnostics.crash.message}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {diagnostics.crash.at} · exit{" "}
                    {diagnostics.crash.code ?? "—"}
                    {diagnostics.crash.signal
                      ? ` · ${diagnostics.crash.signal}`
                      : ""}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="grid min-h-0 gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Protocol events</h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {diagnostics.events.length}
                </span>
              </div>
              <div className="max-h-[42svh] divide-y overflow-auto rounded-lg border">
                {diagnostics.events.length ? (
                  diagnostics.events
                    .slice()
                    .reverse()
                    .map((event) => (
                      <details
                        key={`${event.id}-${event.type}`}
                        className="group"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-xs hover:bg-muted/50">
                          <span className="w-16 shrink-0 text-muted-foreground tabular-nums">
                            {formatTime(event.timestamp)}
                          </span>
                          <code className="min-w-0 truncate">{event.type}</code>
                          <span className="ml-auto text-muted-foreground tabular-nums">
                            #{event.seq}
                          </span>
                        </summary>
                        <pre className="overflow-x-auto border-t bg-muted/30 p-3 text-[11px] leading-5 whitespace-pre-wrap">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      </details>
                    ))
                ) : (
                  <p className="p-4 text-xs text-muted-foreground">
                    当前 Host 生命周期中还没有这个 session 的事件。
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
