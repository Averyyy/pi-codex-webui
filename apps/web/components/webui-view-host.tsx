"use client"

import { useEffect, useMemo, useRef } from "react"

import type {
  ClientExtensionInitializer,
  ExternalViewRenderer,
} from "@pi-web-codex/extension-sdk"
import { cn } from "@workspace/ui/lib/utils"

import { useI18n } from "@/components/i18n-provider"
import { isExtensionCandidateAvailable } from "@/lib/webui-extensions/authorization"
import {
  useSessionExtensionRuntime,
  useSessionExtensionState,
  useSessionExtensionView,
} from "@/components/session-extension-provider"

const clients = new Map<
  string,
  Promise<ReadonlyMap<string, ExternalViewRenderer>>
>()

function loadClient(url: string) {
  let loading = clients.get(url)
  if (loading) return loading
  loading = (async () => {
    try {
      const imported = (await import(/* webpackIgnore: true */ url)) as {
        default?: unknown
      }
      if (typeof imported.default !== "function") {
        throw new TypeError("Adapter client must export a default initializer.")
      }
      const views = new Map<string, ExternalViewRenderer>()
      await (imported.default as ClientExtensionInitializer)({
        registerView(renderer) {
          if (views.has(renderer.id)) {
            throw new Error(`Duplicate client view: ${renderer.id}`)
          }
          views.set(renderer.id, renderer)
        },
      })
      return views
    } catch (error) {
      clients.delete(url)
      throw error
    }
  })()
  clients.set(url, loading)
  return loading
}

export function WebUiViewHost({
  instanceId,
  className,
}: {
  instanceId: string
  className?: string
}) {
  const { t } = useI18n()
  const runtime = useSessionExtensionRuntime()
  const state = useSessionExtensionState()
  const view = useSessionExtensionView(instanceId)
  const extensionId = view?.extensionId
  const viewInstanceId = view?.instanceId
  const adapterKey = view?.adapterKey
  const viewState = view?.state
  const viewRevision = view?.revision
  const hostRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef<{
    update?(state: unknown): void
    dispose(): void
  } | null>(null)
  const stateRef = useRef<unknown>(viewState)
  const viewId = view?.viewId

  const identity = useMemo(
    () =>
      extensionId && viewInstanceId
        ? { extensionId, instanceId: viewInstanceId }
        : null,
    [extensionId, viewInstanceId]
  )
  const candidate = useMemo(
    () =>
      adapterKey
        ? (state.catalog?.groups
            .flatMap((group) => group.candidates)
            .find((item) => item.key === adapterKey) ?? null)
        : null,
    [adapterKey, state.catalog]
  )
  const candidateAvailable = isExtensionCandidateAvailable(
    candidate,
    state.catalog?.projectTrusted === true,
    state.catalogInvalidated
  )
  const projectViewBlocked = Boolean(
    candidate?.source === "project" && !candidateAvailable
  )
  const catalogAvailable = state.catalog !== null
  const clientUrl = projectViewBlocked ? undefined : candidate?.client.url
  const styleUrl = projectViewBlocked ? undefined : candidate?.style?.url

  useEffect(() => {
    if (extensionId && viewInstanceId) {
      stateRef.current = viewState
      mountedRef.current?.update?.(viewState)
    }
  }, [extensionId, viewInstanceId, viewRevision, viewState])

  useEffect(() => {
    const host = hostRef.current
    if (
      !host ||
      !viewId ||
      !identity ||
      !catalogAvailable ||
      !candidateAvailable ||
      !clientUrl ||
      !runtime.authorized ||
      projectViewBlocked
    ) {
      return
    }
    const controller = new AbortController()
    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    const container = document.createElement("div")
    container.style.cssText =
      "box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0"
    shadowRoot.replaceChildren()
    if (styleUrl) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = styleUrl
      shadowRoot.append(link)
    }
    shadowRoot.append(container)
    let mounted = false

    const showFailure = (message: string) => {
      const notice = document.createElement("p")
      notice.setAttribute("role", "status")
      notice.textContent = t("session.extension.nativeUnavailable")
      notice.style.cssText =
        "margin:0;padding:12px;font:14px system-ui;opacity:.7"
      shadowRoot.replaceChildren(notice)
      void runtime.report(identity, "error", message).catch(console.error)
    }

    void (async () => {
      const renderers = await loadClient(clientUrl)
      if (controller.signal.aborted) return
      const renderer = renderers.get(viewId)
      if (!renderer) {
        throw new Error(`Adapter client did not register view ${viewId}.`)
      }
      const result = renderer.mount({
        container,
        shadowRoot,
        state: stateRef.current,
        signal: controller.signal,
        invoke: (action, input) => runtime.invoke(identity, action, input),
        close: (result) => {
          void runtime
            .invoke(identity, "__close", result)
            .catch((error: unknown) =>
              runtime.report(
                identity,
                "error",
                error instanceof Error ? error.message : String(error)
              )
            )
            .catch(console.error)
        },
      })
      if (!result || typeof result.dispose !== "function") {
        throw new TypeError("Adapter view mount must return dispose().")
      }
      if (controller.signal.aborted) {
        result.dispose()
        return
      }
      mountedRef.current = result
      mounted = true
      await runtime.report(identity, "ready")
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error)
        const result = mountedRef.current
        mountedRef.current = null
        mounted = false
        try {
          result?.dispose()
        } finally {
          showFailure(message)
        }
      }
    })

    return () => {
      controller.abort()
      mountedRef.current?.dispose()
      mountedRef.current = null
      if (mounted)
        void runtime.report(identity, "disposed").catch(console.error)
      shadowRoot.replaceChildren()
    }
  }, [
    clientUrl,
    candidateAvailable,
    identity,
    catalogAvailable,
    projectViewBlocked,
    runtime,
    styleUrl,
    t,
    viewId,
  ])

  if (!view) return null
  if (projectViewBlocked) {
    return (
      <div
        className={cn("px-3 py-2 text-xs text-muted-foreground", className)}
        role="status"
      >
        {t("settings.resources.projectUntrusted")}
      </div>
    )
  }
  if (!state.catalog || !clientUrl || !candidateAvailable) {
    return (
      <div
        className={cn("px-3 py-2 text-xs text-muted-foreground", className)}
        role="status"
      >
        {!state.catalog
          ? (state.catalogError ?? t("session.extension.catalogLoading"))
          : t("session.extension.adapterUnavailable")}
      </div>
    )
  }

  return <div ref={hostRef} className={cn("min-w-0", className)} />
}
