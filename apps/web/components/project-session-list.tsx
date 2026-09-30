"use client"

import { memo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MessageSquareTextIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { useI18n } from "@/components/i18n-provider"
import { SessionPageSentinel } from "@/components/session-page-sentinel"
import { useSessionPage } from "@/hooks/use-session-page"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"
import { refreshProjectSessions } from "@/lib/project-session-refresh"
import type { SessionPage, SessionSummary } from "@/lib/session-types"

const ProjectSessionRow = memo(function ProjectSessionRow({
  session,
  projectId,
  locale,
  t,
  fallbackTask,
  fallbackConversation,
}: {
  session: SessionSummary
  projectId: string
  locale: ReturnType<typeof useI18n>["locale"]
  t: ReturnType<typeof useI18n>["t"]
  fallbackTask: string
  fallbackConversation: string
}) {
  const count = session.messageCount.toLocaleString(locale)
  return (
    <Link
      href={`/projects/${projectId}/sessions/${session.id}`}
      prefetch={false}
      className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 98px",
      }}
    >
      <Card className="gap-3 transition-colors group-hover:bg-muted/50">
        <CardHeader>
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate">
                {displaySessionTitle(session, {
                  task: fallbackTask,
                  conversation: fallbackConversation,
                })}
              </CardTitle>
              <CardDescription className="mt-1">
                <time dateTime={session.updatedAt}>
                  {formatTimestamp(session.updatedAt, locale)}
                </time>
              </CardDescription>
            </div>
            <Badge
              variant="secondary"
              className="shrink-0"
              aria-label={t(
                session.messageCount === 1
                  ? "project.sessions.messageCountOne"
                  : "project.sessions.messageCount",
                { count }
              )}
            >
              <MessageSquareTextIcon />
              {count}
            </Badge>
          </div>
        </CardHeader>
      </Card>
    </Link>
  )
})

export function ProjectSessionList({
  projectId,
  initialPage,
  mutationToken,
}: {
  projectId: string
  initialPage: SessionPage
  mutationToken: string
}) {
  const router = useRouter()
  const { locale, t } = useI18n()
  const page = useSessionPage({ scope: "project", projectId, initialPage })
  const refreshingRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const fallbackTask = t("workspace.nav.newTask")
  const fallbackConversation = t("workspace.nav.unnamedConversation")
  async function refresh() {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    setRefreshError(null)
    try {
      const result = await refreshProjectSessions(projectId, mutationToken)
      router.refresh()
      if (result.failures.length > 0) {
        const first = result.failures[0]!
        setRefreshError(
          t("project.sessions.refreshPartial", {
            count: result.failures.length,
            message: `${first.file}: ${first.message}`,
          })
        )
      } else {
        toast.success(t("project.sessions.refreshSuccess"))
      }
    } catch (failure) {
      setRefreshError(
        failure instanceof Error ? failure.message : String(failure)
      )
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }
  return (
    <section
      className="grid gap-3"
      aria-label={t("project.sessions.ariaLabel")}
    >
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          aria-busy={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCwIcon
            data-icon="inline-start"
            className={
              refreshing ? "animate-spin motion-reduce:animate-none" : undefined
            }
          />
          {t(
            refreshing
              ? "project.sessions.refreshing"
              : "project.sessions.refresh"
          )}
        </Button>
      </div>
      {refreshError ? (
        <p role="alert" className="min-w-0 text-sm break-all text-destructive">
          {refreshError}
        </p>
      ) : null}
      {page.sessions.map((session) => (
        <ProjectSessionRow
          key={session.id}
          session={session}
          projectId={projectId}
          locale={locale}
          t={t}
          fallbackTask={fallbackTask}
          fallbackConversation={fallbackConversation}
        />
      ))}
      <SessionPageSentinel {...page} />
      {page.sessions.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t("project.sessions.emptyTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("project.sessions.emptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </section>
  )
}
