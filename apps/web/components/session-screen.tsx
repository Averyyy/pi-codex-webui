import { stat } from "node:fs/promises";
import { notFound } from "next/navigation";

import { ExtensionOverlayHosts } from "@/components/extension-overlay-hosts";
import { ExtensionSlot } from "@/components/extension-slot";
import { SessionDiagnostics } from "@/components/session-diagnostics";
import { SessionExtensionProvider } from "@/components/session-extension-provider";
import { SessionOperations } from "@/components/session-operations";
import { SessionRuntime } from "@/components/session-runtime";
import { SessionWorkspace } from "@/components/session-workspace";
import { SessionTranscript } from "@/components/transcript";
import { getSessionSnapshot } from "@/lib/catalog";
import { loadConfig } from "@/lib/config";
import { readProjectGitStatus } from "@/lib/project-git";
import { projectFileManager } from "@/lib/project-reveal";
import { getMutationToken } from "@/lib/request-security";
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor";
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display";
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry";

async function directoryAvailable(cwd: string) {
  try {
    return (await stat(cwd)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function SessionScreen({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string | null;
}) {
  const [snapshot, config] = await Promise.all([
    getSessionSnapshot(sessionId),
    loadConfig(),
  ]);
  if (!snapshot || snapshot.session.projectId !== projectId) notFound();

  const standalone = projectId === null;
  const workspaceAvailable = await directoryAvailable(snapshot.session.cwd);
  const supervisor = getRuntimeSupervisor();
  const runtime = supervisor.state(sessionId);
  const resources =
    !standalone && workspaceAvailable
      ? await supervisor.resourceCatalog(snapshot.session.cwd)
      : null;
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
          },
    ),
  ]);
  webUiExtensions.statuses = supervisor.webUiExtensionStatuses([sessionId]);
  const mutationToken = getMutationToken();
  const title = displaySessionTitle(snapshot.session);
  const projectGit =
    git ?? ({ available: false, error: "工作区目录不可用。" } as const);
  const fileManager = standalone ? null : projectFileManager(process.platform);

  return (
    <SessionExtensionProvider
      sessionId={sessionId}
      projectId={projectId}
      mutationToken={mutationToken}
      initialCatalog={webUiExtensions}
    >
      <SessionWorkspace
        key={sessionId}
        sessionId={sessionId}
        projectId={projectId}
        mutationToken={mutationToken}
        title={title}
        contextLabel={
          standalone ? "独立任务" : (snapshot.session.projectName ?? "项目")
        }
        updatedAt={formatTimestamp(snapshot.session.updatedAt)}
        runtimeLabel={
          snapshot.session.runtimeKind === "pi" ? "Pi" : "Pi Client"
        }
        workspaceAvailable={workspaceAvailable}
        initialGit={!standalone && workspaceAvailable ? git : null}
        fileManagerLabel={fileManager?.label ?? null}
        environment={
          standalone
            ? null
            : {
                sessionId,
                cwd: snapshot.session.cwd,
                projectName: snapshot.session.projectName,
                runtimeKind: snapshot.session.runtimeKind,
                runtimeStatus: runtime.status,
                updatedAt: snapshot.session.updatedAt,
                git: projectGit,
                workspaceAvailable,
              }
        }
        headerActions={
          <div key="header-actions" className="contents">
            {workspaceAvailable ? (
              <div key="workspace-actions" className="contents">
                <SessionDiagnostics
                  key="session-diagnostics"
                  sessionId={sessionId}
                />
                <SessionOperations
                  key="session-operations"
                  sessionId={sessionId}
                  projectId={projectId}
                  title={title}
                  mutationToken={mutationToken}
                  runtimeProfileId={snapshot.session.runtimeProfileId}
                  runtimeProfiles={Object.entries(
                    config.developer.runtime.profiles,
                  )
                    .filter(([, profile]) => profile.enabled)
                    .map(([id, profile]) => ({
                      id,
                      label: profile.kind === "pi" ? "Pi" : "Pi Client",
                    }))}
                />
              </div>
            ) : null}
            <ExtensionSlot key="session-header" name="session.header" />
          </div>
        }
        toolbar={<ExtensionSlot key="session-toolbar" name="session.toolbar" />}
        conversation={
          <div key="conversation-content" className="contents">
            <ExtensionSlot
              key="conversation-before"
              name="conversation.before"
            />
            <SessionTranscript key="transcript" snapshot={snapshot} />
            <ExtensionSlot key="conversation-after" name="conversation.after" />
          </div>
        }
        composer={
          workspaceAvailable ? (
            <SessionRuntime
              key="session-runtime"
              sessionId={sessionId}
              mutationToken={mutationToken}
              initialStatus={runtime.status}
              initialSnapshot={runtime.snapshot}
            />
          ) : (
            <div
              key="read-only-composer"
              className="shrink-0 border-t px-4 py-3 text-center text-xs text-muted-foreground"
            >
              只读历史 · Runtime 未启动
            </div>
          )
        }
      />
      <ExtensionOverlayHosts key="extension-overlays" />
    </SessionExtensionProvider>
  );
}
