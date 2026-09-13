"use client"

import { useEffect, useRef } from "react"
import { LoaderCircleIcon } from "lucide-react"

import { useI18n } from "@/components/i18n-provider"

export function SessionPageSentinel({
  hasMore,
  loading,
  error,
  loadMore,
}: {
  hasMore: boolean
  loading: boolean
  error: string | null
  loadMore: () => Promise<void>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useI18n()
  useEffect(() => {
    if (!hasMore || loading || error || !ref.current) return
    const element = ref.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: "160px" }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, loading, error, loadMore])
  if (!hasMore && !error) return null
  return (
    <div
      ref={ref}
      className="flex min-h-8 justify-center p-2 text-xs text-muted-foreground"
      data-session-page-sentinel
    >
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="underline"
            onClick={() => void loadMore()}
          >
            {t("app.error.retry")}
          </button>
        </div>
      ) : loading ? (
        <LoaderCircleIcon
          className="size-4 animate-spin"
          aria-label={t("session.list.loading")}
        />
      ) : null}
    </div>
  )
}
