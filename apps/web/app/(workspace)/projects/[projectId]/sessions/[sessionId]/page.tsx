import { notFound } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"

import { SessionTranscript } from "@/components/transcript"
import { getSessionSnapshot } from "@/lib/catalog"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"

export default async function SessionPage({
  params,
}: PageProps<"/projects/[projectId]/sessions/[sessionId]">) {
  const { projectId, sessionId } = await params
  const snapshot = await getSessionSnapshot(sessionId)
  if (!snapshot || snapshot.session.projectId !== projectId) notFound()

  return (
    <main className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4 px-6 py-4 md:px-10">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {displaySessionTitle(snapshot.session)}
            </h1>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {snapshot.session.projectName} ·{" "}
              {formatTimestamp(snapshot.session.updatedAt)}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            只读 JSONL
          </Badge>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8 md:px-10 md:py-12">
        <SessionTranscript snapshot={snapshot} />
        <Separator />
        <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{snapshot.session.messageCount} 条 message entry</span>
          <code
            className="max-w-full truncate"
            title={snapshot.session.nativeSessionFile}
          >
            {snapshot.session.nativeSessionFile}
          </code>
        </footer>
      </div>
    </main>
  )
}
