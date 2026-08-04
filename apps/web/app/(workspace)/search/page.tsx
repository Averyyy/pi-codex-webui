import Link from "next/link"
import { SearchIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"

import { ConversationSearchInput } from "@/components/conversation-search-input"
import { searchSessions } from "@/lib/catalog"
import { getLocalizedConfig } from "@/lib/i18n-server"
import {
  searchEntryTypeLabel,
  searchResultHref,
} from "@/lib/search-result-display"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const value = (await searchParams).q
  const query = (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
  const [{ config, t }, results] = await Promise.all([
    getLocalizedConfig(),
    query ? searchSessions(query) : Promise.resolve([]),
  ])
  const locale = config.appearance.language

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
      <header className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
          <SearchIcon className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("search.title")}
          </h1>
          <p className="mt-1 break-words text-muted-foreground">
            {query
              ? t("search.summary", {
                  query,
                  count: results.length,
                })
              : t("search.description")}
          </p>
        </div>
      </header>

      <form action="/search">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="conversation-search" className="sr-only">
              {t("search.label")}
            </FieldLabel>
            <ConversationSearchInput defaultValue={query} />
            <Button type="submit">
              <SearchIcon data-icon="inline-start" />
              {t("search.submit")}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <section
        className="grid gap-3"
        aria-label={t("search.results.ariaLabel")}
      >
        {results.map((result) => {
          const sessionHref =
            result.projectId === null
              ? `/tasks/${result.sessionId}`
              : `/projects/${result.projectId}/sessions/${result.sessionId}`
          const resultHref = searchResultHref(sessionHref, result)
          return (
            <Link
              key={`${result.sessionId}:${
                result.entryId === null
                  ? "session-title"
                  : `entry:${result.entryId}`
              }`}
              href={resultHref}
              className="group min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Card className="gap-3 transition-colors group-hover:bg-muted/50">
                <CardHeader className="flex min-w-0 flex-row items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">
                      {displaySessionTitle(
                        {
                          title: result.sessionTitle,
                          firstMessage: result.sessionFirstMessage,
                          projectId: result.projectId,
                        },
                        {
                          task: t("workspace.nav.newTask"),
                          conversation: t("workspace.nav.unnamedConversation"),
                        }
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {result.projectName ?? t("search.standaloneTask")} ·{" "}
                      {formatTimestamp(result.timestamp, locale)}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {searchEntryTypeLabel(result.entryType, t)}
                  </Badge>
                </CardHeader>
                <CardContent className="text-sm leading-6 break-words whitespace-pre-wrap">
                  {result.snippet}
                </CardContent>
              </Card>
            </Link>
          )
        })}
        {!query ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t("search.empty.initialTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("search.empty.initialDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : results.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>{t("search.empty.noResultsTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("search.empty.noResultsDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </section>
    </div>
  )
}
