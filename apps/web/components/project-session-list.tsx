"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { MessageSquareTextIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
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
import type { SessionPage } from "@/lib/session-types"

export function ProjectSessionList({
  projectId,
  initialPage,
}: {
  projectId: string
  initialPage: SessionPage
}) {
  const { locale, t } = useI18n()
  const router = useRouter()
  const page = useSessionPage({ scope: "project", projectId, initialPage })
  const fallback = {
    task: t("workspace.nav.newTask"),
    conversation: t("workspace.nav.unnamedConversation"),
  }
  return (
    <section
      className="grid gap-3"
      aria-label={t("project.sessions.ariaLabel")}
    >
      {page.sessions.map((session) => (
        <Link
          key={session.id}
          href={`/projects/${projectId}/sessions/${session.id}`}
          prefetch={false}
          onPointerEnter={() =>
            router.prefetch(`/projects/${projectId}/sessions/${session.id}`)
          }
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
                    {displaySessionTitle(session, fallback)}
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
                    { count: session.messageCount.toLocaleString(locale) }
                  )}
                >
                  <MessageSquareTextIcon />
                  {session.messageCount.toLocaleString(locale)}
                </Badge>
              </div>
            </CardHeader>
          </Card>
        </Link>
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
