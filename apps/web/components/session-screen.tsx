import { stat } from "node:fs/promises"
import { notFound } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"

import { ExtensionOverlayHosts } from "@/components/extension-overlay-hosts"
import { ExtensionSlot } from "@/components/extension-slot"
import { SessionDiagnostics } from "@/components/session-diagnostics"
import { SessionExtensionProvider } from "@/components/session-extension-provider"
import { SessionInspector } from "@/components/session-inspector"
import { SessionOperations } from "@/components/session-operations"
import { SessionRuntime } from "@/components/session-runtime"
import { SessionTranscript } from "@/components/transcript"
import { getSessionSnapshot } from "@/lib/catalog"
import { loadConfig } from "@/lib/config"
import { readProjectGitStatus } from "@/lib/project-git"
import { getMutationToken } from "@/lib/request-security"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry"

async function directoryAvailable(cwd: string) {
  try {
    return (await stat(cwd)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function SessionScreen({
  sessionId,
  projectId,
}: {
  sessionId: string
  projectId: string | null
}) {
  const [snapshot, config] = await Promise.all([
    getSessionSnapshot(sessionId),
    loadConfig(),
  ])
  if (!snapshot || snapshot.session.projectId !== projectId) notFound()

  const standalone = projectId === null
  const workspaceAvailable = await directoryAvailable(snapshot.session.cwd)
  const supervisor = getRuntimeSupervisor()
  const runtime = supervisor.state(sessionId)
  const resources =
    !standalone && workspaceAvailable
      ? await supervisor.resourceCatalog(snapshot.session.cwd)
      : null
  const [git, webUiExtensions] = await Promise.all([
    !standalone && workspaceAvailable
      ? readProjectGitStatus(snapshot.session.cwd)
      : null,
    webUiExtensionCatalog(
      standalone
        ? { projectId: null, projectTrusted: false }
        : {
            ...(workspaceAvailable ? { cwd: snapshot.session.cwd } : {}),
            projectId,
            projectTrusted: resources?.projectTrusted ?? false,
          }
    ),
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
      <div className="flex h-[calc(100svh-3rem)] min-w-0 overflow-hidden md:h-svh">
        <section className="flex min-w-0 flex-1 flex-col bg-background">
          <header className="shrink-0 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex min-h-14 w-full max-w-[46rem] items-center gap-3 px-4 py-2 sm:px-6">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-semibold sm:text-base">
                  {displaySessionTitle(snapshot.session)}
                </h1>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {standalone
                      ? "独立任务"
                      : (snapshot.session.projectName ?? "项目")}
                    {" · "}
                    {formatTimestamp(snapshot.session.updatedAt)}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {snapshot.session.runtimeKind === "pi" ? "Pi" : "Pi Client"}
                  </Badge>
                </div>
              </div>
              {workspaceAvailable ? (
                <div className="mr-10 flex shrink-0 items-center xl:mr-0">
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
              ) : null}
              <ExtensionSlot name="session.header" />
            </div>
            <div className="mx-auto w-full max-w-[46rem] px-4 sm:px-6">
              <ExtensionSlot name="session.toolbar" />
            </div>
          </header>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto grid w-full max-w-[46rem] min-w-0 gap-8 px-4 py-8 sm:px-6 sm:py-10">
              {!workspaceAvailable ? (
                <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm">
                  <p className="font-medium">历史会话仅可阅读</p>
                  <p className="mt-1 text-muted-foreground">
                    原工作目录已不存在，因此不会启动 Runtime，也不会读取
                    Files、Git 或项目资源。
                  </p>
                </div>
              ) : null}
              <ExtensionSlot name="conversation.before" />
              <SessionTranscript snapshot={snapshot} />
              <ExtensionSlot name="conversation.after" />
            </div>
          </div>

          {workspaceAvailable ? (
            <SessionRuntime
              sessionId={sessionId}
              mutationToken={mutationToken}
              initialStatus={runtime.status}
              initialSnapshot={runtime.snapshot}
            />
          ) : (
            <div className="shrink-0 border-t px-4 py-3 text-center text-xs text-muted-foreground">
              只读历史 · Runtime 未启动
            </div>
          )}
        </section>

        <SessionInspector
          key={sessionId}
          sessionId={sessionId}
          standalone={standalone}
          cwd={snapshot.session.cwd}
          projectName={snapshot.session.projectName}
          runtimeKind={snapshot.session.runtimeKind}
          runtimeStatus={runtime.status}
          updatedAt={snapshot.session.updatedAt}
          git={git}
          workspaceAvailable={workspaceAvailable}
        />
      </div>
      <ExtensionOverlayHosts />
    </SessionExtensionProvider>
  )
}
