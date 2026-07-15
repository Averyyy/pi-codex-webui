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
import { Input } from "@workspace/ui/components/input"

import { searchSessions } from "@/lib/catalog"
import { formatTimestamp } from "@/lib/session-display"

export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const value = (await searchParams).q
  const query = (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
  const results = query ? await searchSessions(query) : []

  return (
    <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
      <header className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-muted">
          <SearchIcon className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">搜索</h1>
          <p className="mt-1 text-muted-foreground">
            {query
              ? `“${query}” 找到 ${results.length} 个匹配结果`
              : "搜索对话标题、消息与工具记录"}
          </p>
        </div>
      </header>

      <form action="/search">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="conversation-search" className="sr-only">
              搜索对话
            </FieldLabel>
            <Input
              id="conversation-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="输入关键词"
              enterKeyHint="search"
              autoFocus
            />
            <Button type="submit">
              <SearchIcon data-icon="inline-start" />
              搜索
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <section className="grid gap-3" aria-label="搜索结果">
        {results.map((result) => (
          <Link
            key={`${result.sessionId}:${result.entryId}`}
            href={`${
              result.projectId === null
                ? `/tasks/${result.sessionId}`
                : `/projects/${result.projectId}/sessions/${result.sessionId}`
            }#entry-${result.entryId}`}
            className="group min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="gap-3 transition-colors group-hover:bg-muted/50">
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="truncate">
                    {result.sessionTitle ||
                      result.sessionFirstMessage ||
                      result.sessionId}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {result.projectName ?? "独立任务"} ·{" "}
                    {formatTimestamp(result.timestamp)}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{result.entryType}</Badge>
              </CardHeader>
              <CardContent className="text-sm leading-6 break-words whitespace-pre-wrap">
                {result.snippet}
              </CardContent>
            </Card>
          </Link>
        ))}
        {!query ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>查找过去的对话</EmptyTitle>
              <EmptyDescription>
                输入关键词后，会搜索已索引的标题、消息和工具记录。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : results.length === 0 ? (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>没有匹配结果</EmptyTitle>
              <EmptyDescription>
                尝试更短的关键词，或检查对话是否已归档。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </section>
    </main>
  )
}
