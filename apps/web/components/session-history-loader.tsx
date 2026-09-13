"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { useI18n } from "./i18n-provider"
import {
  useSessionHistoryMetadata,
  useSessionViewController,
} from "./session-streaming-context"

export function SessionHistoryLoader({
  cursor,
  compact,
  atLatest,
}: {
  cursor: string | null
  compact: boolean
  atLatest: boolean
}) {
  const controller = useSessionViewController()
  const metadata = useSessionHistoryMetadata()
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sentinel = ref.current
    const root = sentinel?.closest<HTMLElement>("[data-session-scroll]")
    if (!root || !sentinel || !cursor || metadata.loadingEarlier) return
    let visible = false
    let armed = false
    const load = () => {
      if (visible && armed) void controller.loadEarlier()
    }
    const wheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        armed = true
        load()
      }
    }
    const key = (event: KeyboardEvent) => {
      if (
        (event.target as Element)?.closest(
          "input,textarea,[contenteditable=true]"
        )
      )
        return
      if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
        armed = true
        load()
      }
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting === true
        load()
      },
      { root, rootMargin: "160px 0px 0px" }
    )
    observer.observe(sentinel)
    root.addEventListener("wheel", wheel, { passive: true })
    root.addEventListener("keydown", key)
    return () => {
      observer.disconnect()
      root.removeEventListener("wheel", wheel)
      root.removeEventListener("keydown", key)
    }
  }, [controller, cursor, metadata.loadingEarlier])
  if (!cursor && !metadata.error && atLatest) return null
  return (
    <div
      ref={ref}
      className="flex flex-col items-center gap-2 py-2 text-xs text-muted-foreground"
      data-history-loader
    >
      {metadata.error ? <p role="alert">{metadata.error}</p> : null}
      {!atLatest ? (
        <button
          type="button"
          className="rounded-md px-3 py-2 hover:bg-muted"
          onClick={() => {
            window.history.replaceState(
              window.history.state,
              "",
              window.location.pathname + window.location.search
            )
            void controller.showLatest().catch(() => undefined)
          }}
        >
          {t("session.history.latest")}
        </button>
      ) : null}
      {cursor ? (
        <button
          type="button"
          onClick={() => void controller.loadEarlier(true)}
          disabled={metadata.loadingEarlier}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted"
        >
          {metadata.loadingEarlier ? (
            <LoaderCircleIcon className="size-3 animate-spin" />
          ) : null}
          {t(
            compact
              ? "session.history.beforeCompact"
              : "session.history.earlier"
          )}
        </button>
      ) : null}
      {metadata.error ? (
        <button
          type="button"
          className="underline"
          onClick={() => void controller.refresh().catch(() => undefined)}
        >
          {t("app.error.retry")}
        </button>
      ) : null}
    </div>
  )
}

export function DeferredHistoryEntry({
  id,
  byteLength,
}: {
  id: string
  byteLength: number
}) {
  const { t, locale } = useI18n()
  const controller = useSessionViewController()
  const [loading, setLoading] = useState(false)
  return (
    <div id={`entry-${id}`} className="rounded-lg border p-4 text-sm">
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setLoading(true)
          void controller.loadEntry(id).finally(() => setLoading(false))
        }}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        {loading ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
        {t("session.history.largeEntry", {
          size: (byteLength / 1024).toLocaleString(locale, {
            maximumFractionDigits: 0,
          }),
        })}
      </button>
    </div>
  )
}
