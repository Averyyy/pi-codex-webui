"use client"

import { useEffect, useEffectEvent, useRef } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { useI18n } from "@/components/i18n-provider"
import { TerminalActionQueue } from "@/lib/terminal-action-queue"

const INPUT_BATCH_MS = 8
const MAX_INPUT_LENGTH = 65_536

type ShellMessage =
  | { type: "snapshot"; data: string; exitCode: number | null }
  | { type: "data"; data: string }
  | { type: "exit"; exitCode: number; signal: number | null }

export function ShellTerminal({
  sessionId,
  mutationToken,
  className,
}: {
  sessionId: string
  mutationToken: string
  className?: string
}) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const reportError = useEffectEvent((error: unknown) => {
    toast.error(error instanceof Error ? error.message : String(error))
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let eventSource: EventSource | undefined
    let resizeObserver: ResizeObserver | undefined
    let inputTimer: number | undefined
    let input = ""
    let cleanupTerminal = () => {}
    const endpoint = `/api/v1/sessions/${sessionId}/terminal`

    const action = async (body: unknown, signal: AbortSignal) => {
      const response = await fetch(endpoint, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error(
          (await response.text()) || t("session.terminal.operationFailed")
        )
      }
    }

    const actions = new TerminalActionQueue(action, reportError)
    const enqueue = (body: unknown) => {
      void actions.enqueue(body)
    }

    const flushInput = () => {
      if (inputTimer !== undefined) window.clearTimeout(inputTimer)
      inputTimer = undefined
      while (input) {
        const data = input.slice(0, MAX_INPUT_LENGTH)
        input = input.slice(MAX_INPUT_LENGTH)
        enqueue({ action: "input", data })
      }
    }

    const initialize = async () => {
      if (disposed) return
      const foreground = getComputedStyle(container).color
      const terminal = new Terminal({
        allowTransparency: true,
        convertEol: false,
        cursorBlink: true,
        fontFamily:
          'SFMono-Regular, "Cascadia Code", "Roboto Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 13,
        screenReaderMode: true,
        scrollback: 10_000,
        theme: {
          background: "#00000000",
          foreground,
          cursor: foreground,
        },
      })
      const fit = new FitAddon()
      terminal.loadAddon(fit)
      terminal.open(container)
      cleanupTerminal = () => terminal.dispose()
      const fitToProtocol = () => {
        fit.fit()
        const columns = Math.min(500, Math.max(2, terminal.cols))
        const rows = Math.min(300, Math.max(1, terminal.rows))
        if (columns !== terminal.cols || rows !== terminal.rows) {
          terminal.resize(columns, rows)
        }
        return { columns, rows }
      }
      const initialSize = fitToProtocol()
      await action(
        {
          action: "start",
          ...initialSize,
        },
        actions.signal
      )
      if (disposed) {
        terminal.dispose()
        return
      }

      eventSource = new EventSource(endpoint)
      const receive = (source: Event) => {
        const message = JSON.parse(
          (source as MessageEvent<string>).data
        ) as ShellMessage
        if (message.type === "snapshot") {
          terminal.reset()
          terminal.write(message.data)
          if (message.exitCode !== null) {
            terminal.write(
              `\r\n[${t("session.terminal.processExited", { code: message.exitCode })}]\r\n`
            )
          }
        } else if (message.type === "data") {
          terminal.write(message.data)
        } else {
          terminal.write(
            `\r\n[${t("session.terminal.processExited", { code: message.exitCode })}]\r\n`
          )
        }
      }
      eventSource.addEventListener("snapshot", receive)
      eventSource.addEventListener("data", receive)
      eventSource.addEventListener("exit", receive)

      const inputDisposable = terminal.onData((data) => {
        input += data
        if (input.length >= MAX_INPUT_LENGTH) flushInput()
        else if (inputTimer === undefined) {
          inputTimer = window.setTimeout(flushInput, INPUT_BATCH_MS)
        }
      })

      let lastSize = `${initialSize.columns}x${initialSize.rows}`
      const resize = () => {
        const { columns, rows } = fitToProtocol()
        const size = `${columns}x${rows}`
        if (size === lastSize) return
        lastSize = size
        enqueue({
          action: "resize",
          columns,
          rows,
        })
      }
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
      terminal.focus()

      cleanupTerminal = () => {
        resizeObserver?.disconnect()
        inputDisposable.dispose()
        terminal.dispose()
      }
    }
    void initialize().catch((error: unknown) => {
      if (!disposed) reportError(error)
    })

    return () => {
      disposed = true
      actions.dispose()
      if (inputTimer !== undefined) window.clearTimeout(inputTimer)
      inputTimer = undefined
      input = ""
      eventSource?.close()
      resizeObserver?.disconnect()
      cleanupTerminal()
    }
  }, [mutationToken, sessionId, t])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={t("session.terminal.ariaLabel")}
      className={cn(
        "size-full min-h-32 overflow-hidden bg-background p-3 text-foreground [&_.xterm-viewport]:!bg-transparent",
        className
      )}
      onPointerDown={() =>
        containerRef.current
          ?.querySelector<HTMLTextAreaElement>("textarea")
          ?.focus()
      }
    />
  )
}
