"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

import {
  resourceCatalogSchema,
  type ResourceCatalog,
} from "@workspace/runtime-protocol"

import { ExtensionOverlayHosts } from "@/components/extension-overlay-hosts"
import { CatalogRefreshAction } from "@/components/catalog-refresh-action"
import { PerformanceProbe } from "@/components/performance-probe"
import { ExtensionSlot } from "@/components/extension-slot"
import { SessionDiagnostics } from "@/components/session-diagnostics"
import { SessionExtensionProvider } from "@/components/session-extension-provider"
import { SessionOperations } from "@/components/session-operations"
import { SessionRuntime } from "@/components/session-runtime"
import { SessionStreamingMessage } from "@/components/session-streaming"
import { SessionWorkspace } from "@/components/session-workspace"
import { SubagentsProvider } from "@/components/subagents"
import { SessionTranscript } from "@/components/transcript"
import { useI18n } from "@/components/i18n-provider"
import {
  useSessionView,
  useSessionHistoryMetadata,
  useSessionViewController,
} from "@/components/session-streaming-context"
import { responseJson } from "@/lib/api-response"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"
import {
  cancelCachedViewportMeasurement,
  getCachedViewportMeasurementState,
  isPerformanceDiagnosticsEnabled,
  recordCachedViewportReady,
} from "@/lib/performance-diagnostics"
import { hasTintinSubagentsExtension } from "@/lib/subagents"
import {
  SESSION_ENTITY_UPDATED,
  type SessionEntityUpdatedDetail,
} from "@/lib/session-catalog-events"
import type { SessionRouteClientData } from "@/lib/session-route-client"

export function SessionClientViewport({
  route,
  identityVerified,
}: {
  route: SessionRouteClientData
  identityVerified: boolean
}) {
  const { locale, t } = useI18n()
  const controller = useSessionViewController()
  const view = useSessionView()
  const historyMetadata = useSessionHistoryMetadata()
  const [cachedViewAtMount] = useState(() => controller.getView() !== null)
  const cachedViewDiagnosticsRef = useRef<HTMLOutputElement>(null)
  const viewportPath =
    route.projectId === null
      ? `/tasks/${encodeURIComponent(route.session.id)}`
      : `/projects/${encodeURIComponent(route.projectId)}/sessions/${encodeURIComponent(route.session.id)}`
  const resourceIdentity = JSON.stringify([
    route.identityKey,
    route.projectTrusted,
    route.subagentsInstalled,
  ])
  const [resources, setResources] = useState(() => ({
    identityKey: resourceIdentity,
    projectId: route.projectId,
    projectTrusted:
      route.projectId === null
        ? true
        : route.workspaceAvailable
          ? route.projectTrusted
          : false,
    subagentsInstalled:
      route.workspaceAvailable && route.projectId !== null
        ? route.subagentsInstalled
        : false,
    error: null as string | null,
  }))
  const [resourceRequest, setResourceRequest] = useState(0)

  useLayoutEffect(() => {
    const stateBefore = getCachedViewportMeasurementState()
    let recorded = false
    if (cachedViewAtMount && view) {
      recorded = recordCachedViewportReady(viewportPath)
    } else if (!cachedViewAtMount) {
      cancelCachedViewportMeasurement(viewportPath)
    }
    const output = cachedViewDiagnosticsRef.current
    if (!output || !isPerformanceDiagnosticsEnabled()) return
    const stateAfter = getCachedViewportMeasurementState()
    output.dataset.cachedAtMount = String(cachedViewAtMount)
    output.dataset.readyPath = view ? viewportPath : ""
    output.dataset.pendingPath = stateBefore.destinationPathname ?? ""
    output.dataset.pendingBefore = String(stateBefore.pending)
    output.dataset.pending = String(stateAfter.pending)
    output.dataset.recorded = String(recorded)
  }, [cachedViewAtMount, view, viewportPath])

  const resourceState =
    resources.identityKey === resourceIdentity &&
    resources.projectId === route.projectId
      ? resources
      : {
          identityKey: resourceIdentity,
          projectId: route.projectId,
          projectTrusted:
            route.projectId === null
              ? true
              : route.workspaceAvailable
                ? route.projectTrusted
                : false,
          subagentsInstalled:
            route.workspaceAvailable && route.projectId !== null
              ? route.subagentsInstalled
              : false,
          error: null,
        }
  const projectTrusted = resourceState.projectTrusted
  const subagentsInstalled = resourceState.subagentsInstalled
  const resourceError = resourceState.error

  useEffect(() => {
    const handleEntityUpdate = (source: Event) => {
      const detail = (source as CustomEvent<SessionEntityUpdatedDetail>).detail
      if (!detail || detail.sessionId !== route.session.id) return
      controller.updateSessionSummary({
        ...(detail.title !== undefined ? { title: detail.title } : {}),
        ...(detail.hasUnreadCompletion !== undefined
          ? { hasUnreadCompletion: detail.hasUnreadCompletion }
          : {}),
      })
    }
    window.addEventListener(SESSION_ENTITY_UPDATED, handleEntityUpdate)
    return () =>
      window.removeEventListener(SESSION_ENTITY_UPDATED, handleEntityUpdate)
  }, [controller, route.session.id])

  useEffect(() => {
    if (!route.projectId || !route.workspaceAvailable) return
    if (route.projectTrusted !== null && route.subagentsInstalled !== null)
      return

    let disposed = false
    void fetch(
      `/api/v1/resources?projectId=${encodeURIComponent(route.projectId)}`,
      { cache: "no-store" }
    )
      .then((response) => responseJson<ResourceCatalog>(response))
      .then((catalog) => resourceCatalogSchema.parse(catalog))
      .then((catalog) => {
        if (disposed) return
        setResources({
          identityKey: resourceIdentity,
          projectId: route.projectId,
          projectTrusted: catalog.projectTrusted,
          subagentsInstalled: hasTintinSubagentsExtension(catalog),
          error: null,
        })
      })
      .catch((failure: unknown) => {
        if (disposed) return
        setResources({
          identityKey: resourceIdentity,
          projectId: route.projectId,
          projectTrusted: null,
          subagentsInstalled: null,
          error: failure instanceof Error ? failure.message : String(failure),
        })
      })
    return () => {
      disposed = true
    }
  }, [
    resourceRequest,
    resourceIdentity,
    route.projectId,
    route.projectTrusted,
    route.subagentsInstalled,
    route.workspaceAvailable,
  ])

  const session = view?.snapshot.session ?? route.session
  const runtimeStatus = view?.runtime.status ?? route.runtime.status
  const runtimeSnapshot = view?.runtime.snapshot ?? route.runtime.snapshot
  const canMutate = identityVerified && route.workspaceAvailable
  const extensionsAuthorized = canMutate
  const projectTrustMessage =
    route.projectId !== null && projectTrusted !== true
      ? projectTrusted === false
        ? t("settings.resources.projectUntrusted")
        : (resourceError ?? t("session.project.checking"))
      : null
  const title = displaySessionTitle(session, {
    task: t("workspace.nav.newTask"),
    conversation: t("workspace.nav.unnamedConversation"),
  })
  const fileManagerLabel = route.fileManagerKind
    ? t(
        route.fileManagerKind === "finder"
          ? "session.workspace.openFinder"
          : "session.workspace.openFileExplorer"
      )
    : null

  const composer = route.workspaceAvailable ? (
    <>
      {projectTrustMessage ? (
        <div
          className="shrink-0 border-t px-4 py-2 text-center text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span>{projectTrustMessage}</span>
          {resourceError ? (
            <button
              type="button"
              className="ml-2 underline underline-offset-2"
              onClick={() => setResourceRequest((value) => value + 1)}
            >
              {t("session.project.retry")}
            </button>
          ) : null}
        </div>
      ) : null}
      <PerformanceProbe id="sessionRuntime">
        <SessionRuntime
          key={route.identityKey}
          sessionId={session.id}
          mutationToken={route.mutationToken}
          initialStatus={runtimeStatus}
          initialSnapshot={runtimeSnapshot}
          initialGoalState={view?.snapshot.goalState ?? null}
          canConnect={canMutate}
          canSend={canMutate}
        />
      </PerformanceProbe>
    </>
  ) : (
    <div className="shrink-0 border-t px-4 py-3 text-center text-xs text-muted-foreground">
      {t("session.readOnlyComposer")}
    </div>
  )

  return (
    <SessionExtensionProvider
      key={route.identityKey}
      sessionId={session.id}
      projectId={route.projectId}
      identityKey={route.identityKey}
      mutationToken={route.mutationToken}
      initialCatalog={null}
      initialViews={null}
      authorized={extensionsAuthorized}
    >
      <SubagentsProvider
        sessionId={session.id}
        mutationToken={route.mutationToken}
        installed={subagentsInstalled === true}
      >
        <PerformanceProbe id="sessionWorkspace">
          <SessionWorkspace
            key={route.identityKey}
            sessionId={session.id}
            conversationId={session.nativeSessionId}
            conversationPath={session.nativeSessionFile}
            workingDirectory={session.cwd}
            projectId={route.projectId}
            mutationToken={route.mutationToken}
            title={title}
            contextLabel={
              route.projectId === null
                ? t("session.context.standalone")
                : (session.projectName ?? t("session.context.project"))
            }
            updatedAt={formatTimestamp(session.updatedAt, locale)}
            runtimeLabel={session.runtimeKind === "pi" ? "Pi" : "Pi Client"}
            workspaceAvailable={route.workspaceAvailable}
            canMutate={canMutate}
            subagentsInstalled={subagentsInstalled === true}
            initialGit={null}
            fileManagerLabel={fileManagerLabel}
            environment={{
              cwd: session.cwd,
              projectName: session.projectName,
              runtimeKind: session.runtimeKind,
              runtimeStatus,
              updatedAt: session.updatedAt,
              workspaceAvailable: route.workspaceAvailable,
              subagentsInstalled: subagentsInstalled === true,
            }}
            headerActions={
              <div className="contents">
                {route.workspaceAvailable && canMutate ? (
                  <div className="contents">
                    <CatalogRefreshAction
                      modelTarget={{ sessionId: session.id }}
                      projectId={route.projectId}
                      sessionId={session.id}
                      mutationToken={route.mutationToken}
                    />
                    <SessionDiagnostics sessionId={session.id} />
                    <SessionOperations
                      sessionId={session.id}
                      projectId={route.projectId}
                      title={title}
                      isPinned={session.isPinned}
                      mutationToken={route.mutationToken}
                      runtimeProfileId={session.runtimeProfileId}
                      initialRuntimeStatus={runtimeStatus}
                      runtimeProfiles={route.runtimeProfiles}
                    />
                  </div>
                ) : null}
                <ExtensionSlot name="session.header" />
              </div>
            }
            toolbar={<ExtensionSlot name="session.toolbar" />}
            conversation={
              view ? (
                <div className="contents">
                  <ExtensionSlot name="conversation.before" />
                  <SessionTranscript
                    snapshot={view.snapshot}
                    sessionId={session.id}
                    mutationToken={route.mutationToken}
                    workspaceUnavailable={!route.workspaceAvailable}
                    initialRuntimeStatus={runtimeStatus}
                    locale={locale}
                  />
                  <ExtensionSlot name="conversation.after" />
                  <SessionStreamingMessage />
                </div>
              ) : historyMetadata.error ? (
                <div
                  className="grid min-h-40 place-items-center gap-3 p-4 text-sm"
                  role="alert"
                  aria-live="assertive"
                >
                  <p className="text-destructive">{historyMetadata.error}</p>
                  <button
                    type="button"
                    className="rounded-md border px-3 py-2 hover:bg-muted"
                    onClick={() =>
                      void (
                        route.nativeFileChanged
                          ? controller.refreshSelectedFile(
                              route.nativeFileRevision
                            )
                          : controller.refresh()
                      ).catch(() => undefined)
                    }
                  >
                    {t("app.error.retry")}
                  </button>
                </div>
              ) : (
                <div
                  className="grid min-h-40 flex-1 place-items-center text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                >
                  {t("session.list.loading")}
                </div>
              )
            }
            composer={composer}
          />
        </PerformanceProbe>
        <ExtensionOverlayHosts />
        <output
          ref={cachedViewDiagnosticsRef}
          data-performance-cached-view-diagnostics
          className="sr-only"
          aria-hidden="true"
        />
      </SubagentsProvider>
    </SessionExtensionProvider>
  )
}
