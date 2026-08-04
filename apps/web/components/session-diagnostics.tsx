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

import { useI18n } from "@/components/i18n-provider"
import { validatedResponseJson } from "@/lib/api-response"
import type { Translator } from "@/lib/i18n"
import {
  protocolEventSchema,
  runtimeDiagnosticsSchema,
  type ProtocolEvent,
  type RuntimeDiagnostics,
} from "@/lib/runtime-diagnostics"

async function loadDiagnostics(sessionId: string, t: Translator) {
  const response = await fetch(`/api/v1/sessions/${sessionId}/diagnostics`, {
    cache: "no-store",
  })
  return validatedResponseJson(
    response,
    runtimeDiagnosticsSchema.parse,
    t("session.diagnostics.loadFailed")
  )
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

function formatTime(timestamp: string, locale: string) {
  return new Date(timestamp).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function statusLabel(t: Translator, status: RuntimeDiagnostics["status"]) {
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

export function SessionDiagnostics({ sessionId }: { sessionId: string }) {
  const { locale, t } = useI18n()
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
    void loadDiagnostics(sessionId, t).then(
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
      let event: ProtocolEvent
      try {
        event = protocolEventSchema.parse(
          JSON.parse((source as MessageEvent<string>).data)
        )
      } catch {
        setConnectionError(t("session.diagnostics.invalidEvent"))
        return
      }
      setConnectionError(null)
      if (!loaded) {
        pendingEvents.push(event)
        return
      }
      setDiagnostics((current) =>
        current ? nextStatus(current, event) : current
      )
    })
    events.onerror = () =>
      setConnectionError(t("session.diagnostics.connectionLost"))
    events.onopen = () => setConnectionError(null)
    return () => {
      active = false
      events.close()
    }
  }, [open, sessionId, t])

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
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("session.diagnostics.button")}
        >
          <ActivityIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("session.diagnostics.title")}</DialogTitle>
          <DialogDescription>
            {t("session.diagnostics.description")}
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
                <h3 className="font-medium">
                  {t("session.diagnostics.runtime")}
                </h3>
                <Badge
                  variant={
                    diagnostics.status === "crashed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {statusLabel(t, diagnostics.status)}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border p-4 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">PID</dt>
                  <dd className="mt-1 font-mono">{diagnostics.pid ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("session.diagnostics.runtime")}
                  </dt>
                  <dd className="mt-1">{diagnostics.runtimeKind ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("session.diagnostics.profile")}
                  </dt>
                  <dd
                    className="mt-1 truncate"
                    title={diagnostics.runtimeProfileId ?? ""}
                  >
                    {diagnostics.runtimeProfileId ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("session.diagnostics.pendingIpc")}
                  </dt>
                  <dd className="mt-1 tabular-nums">
                    {diagnostics.pendingRequests}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("session.diagnostics.activeMcp")}
                  </dt>
                  <dd className="mt-1 tabular-nums">
                    {diagnostics.activeMcpCalls}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("session.diagnostics.activeTools")}
                  </dt>
                  <dd className="mt-1 tabular-nums">
                    {diagnostics.activeTools.length}
                  </dd>
                </div>
              </dl>
              {diagnostics.crash ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs">
                  <p className="font-medium text-destructive">
                    {t("session.diagnostics.lastCrash")}
                  </p>
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
                <h3 className="font-medium">
                  {t("session.diagnostics.protocolEvents")}
                </h3>
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
                            {formatTime(event.timestamp, locale)}
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
                    {t("session.diagnostics.noEvents")}
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
