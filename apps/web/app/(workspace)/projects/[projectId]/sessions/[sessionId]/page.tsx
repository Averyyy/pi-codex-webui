import { notFound } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"

import { SessionRuntime } from "@/components/session-runtime"
import { SessionOperations } from "@/components/session-operations"
import { SessionTranscript } from "@/components/transcript"
import { getSessionSnapshot } from "@/lib/catalog"
import { loadConfig } from "@/lib/config"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"

export default async function SessionPage({
  params,
}: PageProps<"/projects/[projectId]/sessions/[sessionId]">) {
  const { projectId, sessionId } = await params
  const [snapshot, config] = await Promise.all([
    getSessionSnapshot(sessionId),
    loadConfig(),
  ])
  if (!snapshot || snapshot.session.projectId !== projectId) notFound()
  const runtime = getRuntimeSupervisor().state(sessionId)

  return (
    <main className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-4xl px-6 py-4 md:px-10">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold">
                {displaySessionTitle(snapshot.session)}
              </h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {snapshot.session.projectName} ·{" "}
                  {formatTimestamp(snapshot.session.updatedAt)}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {snapshot.session.runtimeKind === "pi" ? "Pi" : "Pi Client"}
                </Badge>
              </div>
            </div>
            <SessionOperations
              sessionId={sessionId}
              projectId={projectId}
              title={displaySessionTitle(snapshot.session)}
              mutationToken={getMutationToken()}
              runtimeProfileId={snapshot.session.runtimeProfileId}
              runtimeProfiles={Object.entries(config.developer.runtime.profiles)
                .filter(([, profile]) => profile.enabled)
                .map(([id, profile]) => ({
                  id,
                  label: profile.kind === "pi" ? "Pi" : "Pi Client",
                }))}
            />
          </div>
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
        <SessionRuntime
          sessionId={sessionId}
          mutationToken={getMutationToken()}
          initialStatus={runtime.status}
          initialSnapshot={runtime.snapshot}
        />
      </div>
    </main>
  )
}
