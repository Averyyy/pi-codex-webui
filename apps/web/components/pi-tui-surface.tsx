"use client"

import { useEffect, useEffectEvent, useRef } from "react"

import type {
  TuiSurfaceAction,
  TuiSurfaceSnapshot,
} from "@workspace/runtime-protocol"

type Props = {
  surface: TuiSurfaceSnapshot
  onAction: (action: TuiSurfaceAction) => Promise<void>
  onError: (error: Error) => void
}

const INPUT_BATCH_MS = 8
const MAX_INPUT_LENGTH = 65_536

export function PiTuiSurface({ surface, onAction, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderRef = useRef<(() => void) | null>(null)
  const readSurface = useEffectEvent(() => surface)
  const act = useEffectEvent(onAction)
  const reportError = useEffectEvent(onError)

  useEffect(() => renderRef.current?.(), [surface.data, surface.revision])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let resizeObserver: ResizeObserver | undefined
    let inputTimer: number | undefined
    let input = ""
    let actionQueue = Promise.resolve()
    let cleanupTerminal = () => {}

    const enqueue = (action: TuiSurfaceAction) => {
      actionQueue = actionQueue
        .then(() => act(action))
        .catch((error: unknown) =>
          reportError(error instanceof Error ? error : new Error(String(error)))
        )
    }

    const flushInput = () => {
      if (inputTimer !== undefined) window.clearTimeout(inputTimer)
      inputTimer = undefined
      while (input) {
        const data = input.slice(0, MAX_INPUT_LENGTH)
        input = input.slice(MAX_INPUT_LENGTH)
        enqueue({ version: 1, action: "input", data })
      }
    }

    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")])
      .then(([{ Terminal }, { FitAddon }]) => {
        if (disposed) return
        const foreground = getComputedStyle(container).color
        const terminal = new Terminal({
          allowTransparency: true,
          convertEol: false,
          cursorBlink: true,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          screenReaderMode: true,
          scrollback: 0,
          theme: {
            background: "#00000000",
            foreground,
            cursor: foreground,
          },
        })
        const fit = new FitAddon()
        terminal.loadAddon(fit)
        terminal.open(container)

        let renderedData = ""
        let renderedRevision = -1
        const render = () => {
          const current = readSurface()
          if (current.revision < renderedRevision) return
          if (
            current.revision > renderedRevision &&
            current.data.startsWith(renderedData)
          ) {
            terminal.write(current.data.slice(renderedData.length))
          } else if (
            current.revision !== renderedRevision ||
            current.data !== renderedData
          ) {
            terminal.reset()
            terminal.write(current.data)
          }
          renderedData = current.data
          renderedRevision = current.revision
        }
        renderRef.current = render

        let lastSize = ""
        const resize = () => {
          flushInput()
          fit.fit()
          const columns = Math.min(400, Math.max(20, terminal.cols))
          const rows = Math.min(200, Math.max(3, terminal.rows))
          if (columns !== terminal.cols || rows !== terminal.rows) {
            terminal.resize(columns, rows)
          }
          const size = `${columns}x${rows}`
          if (size === lastSize) return
          lastSize = size
          enqueue({
            version: 1,
            action: "resize",
            columns,
            rows,
          })
        }
        resize()
        render()
        terminal.focus()

        const inputDisposable = terminal.onData((data) => {
          input += data
          if (input.length >= MAX_INPUT_LENGTH) flushInput()
          else if (inputTimer === undefined) {
            inputTimer = window.setTimeout(flushInput, INPUT_BATCH_MS)
          }
        })
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(container)

        cleanupTerminal = () => {
          flushInput()
          renderRef.current = null
          resizeObserver?.disconnect()
          inputDisposable.dispose()
          terminal.dispose()
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          reportError(error instanceof Error ? error : new Error(String(error)))
        }
      })

    return () => {
      disposed = true
      if (inputTimer !== undefined) window.clearTimeout(inputTimer)
      resizeObserver?.disconnect()
      cleanupTerminal()
    }
  }, [surface.surfaceId])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={surface.title ?? "Pi TUI"}
      className={
        surface.mode === "inline"
          ? "h-40 w-full overflow-hidden rounded-lg bg-muted/30 p-2 text-foreground"
          : "h-[min(55vh,26rem)] w-full overflow-hidden rounded-lg bg-muted/30 p-2 text-foreground"
      }
      onPointerDown={() =>
        containerRef.current
          ?.querySelector<HTMLTextAreaElement>("textarea")
          ?.focus()
      }
    />
  )
}
