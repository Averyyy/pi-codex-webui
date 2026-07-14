import { notFound } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"

import { SessionRuntime } from "@/components/session-runtime"
import { SessionExtensionProvider } from "@/components/session-extension-provider"
import { ExtensionSlot } from "@/components/extension-slot"
import { ExtensionOverlayHosts } from "@/components/extension-overlay-hosts"
import { SessionDiagnostics } from "@/components/session-diagnostics"
import { SessionOperations } from "@/components/session-operations"
import { SessionTranscript } from "@/components/transcript"
import { getSessionSnapshot } from "@/lib/catalog"
import { loadConfig } from "@/lib/config"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { readProjectGitStatus } from "@/lib/project-git"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry"

export default async function SessionPage({
  params,
}: PageProps<"/projects/[projectId]/sessions/[sessionId]">) {
  const { projectId, sessionId } = await params
  const [snapshot, config] = await Promise.all([
    getSessionSnapshot(sessionId),
    loadConfig(),
  ])
  if (!snapshot || snapshot.session.projectId !== projectId) notFound()
  const supervisor = getRuntimeSupervisor()
  const runtime = supervisor.state(sessionId)
  const resources = await supervisor.resourceCatalog(
    snapshot.session.projectPath
  )
  const [git, webUiExtensions] = await Promise.all([
    readProjectGitStatus(snapshot.session.projectPath),
    webUiExtensionCatalog({
      cwd: snapshot.session.projectPath,
      projectId,
      projectTrusted: resources.projectTrusted,
    }),
  ])
  webUiExtensions.statuses = supervisor.webUiExtensionStatuses([sessionId])
  const mutationToken = getMutationToken()

  return (
    <SessionExtensionProvider
      sessionId={sessionId}
      projectId={projectId}
      mutationToken={mutationToken}
      initialCatalog={webUiExtensions}
    >
      <main className="min-h-svh">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto w-full max-w-4xl px-4 py-3 sm:px-6 md:px-10 md:py-4">
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
                  {git.available && git.branch ? (
                    <Badge
                      variant="outline"
                      className="hidden shrink-0 sm:flex"
                    >
                      {git.branch}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <SessionDiagnostics sessionId={sessionId} />
                <SessionOperations
                  sessionId={sessionId}
                  projectId={projectId}
                  title={displaySessionTitle(snapshot.session)}
                  mutationToken={mutationToken}
                  runtimeProfileId={snapshot.session.runtimeProfileId}
                  runtimeProfiles={Object.entries(
                    config.developer.runtime.profiles
                  )
                    .filter(([, profile]) => profile.enabled)
                    .map(([id, profile]) => ({
                      id,
                      label: profile.kind === "pi" ? "Pi" : "Pi Client",
                    }))}
                />
              </div>
            </div>
            <ExtensionSlot name="session.header" />
            <ExtensionSlot name="session.toolbar" />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-10 md:py-12">
          <ExtensionSlot name="conversation.before" />
          <SessionTranscript snapshot={snapshot} />
          <ExtensionSlot name="conversation.after" />
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
            mutationToken={mutationToken}
            initialStatus={runtime.status}
            initialSnapshot={runtime.snapshot}
          />
        </div>
        <ExtensionOverlayHosts />
      </main>
    </SessionExtensionProvider>
  )
}
