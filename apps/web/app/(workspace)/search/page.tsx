import Link from "next/link"
import { SearchIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

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
              : "在左侧输入要查找的内容"}
          </p>
        </div>
      </header>

      <section className="grid gap-3">
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {result.projectName ?? "独立任务"} ·{" "}
                    {formatTimestamp(result.timestamp)}
                  </p>
                </div>
                <Badge variant="secondary">{result.entryType}</Badge>
              </CardHeader>
              <CardContent className="text-sm leading-6 break-words whitespace-pre-wrap">
                {result.snippet}
              </CardContent>
            </Card>
          </Link>
        ))}
        {query && results.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            没有匹配的已索引消息。
          </p>
        ) : null}
      </section>
    </main>
  )
}
