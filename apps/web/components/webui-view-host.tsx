"use client"

import { useContext, useEffect, useMemo, useRef } from "react"

import type {
  ClientExtensionInitializer,
  ExternalViewRenderer,
} from "@pi-web-codex/extension-sdk"
import type { WebUiViewSnapshot } from "@workspace/runtime-protocol"

import { SessionExtensionContext } from "@/components/session-extension-provider"

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

export function WebUiViewHost({ view }: { view: WebUiViewSnapshot }) {
  const runtime = useContext(SessionExtensionContext)
  const hostRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef<{
    update?(state: unknown): void
    dispose(): void
  } | null>(null)
  const stateRef = useRef(view.state)
  if (!runtime) {
    throw new Error("WebUiViewHost requires SessionExtensionProvider.")
  }
  const { catalog, invoke, report } = runtime
  const { adapterKey, extensionId, instanceId, viewId } = view
  const identity = useMemo(
    () => ({ extensionId, instanceId }),
    [extensionId, instanceId]
  )
  const candidate = catalog.groups
    .flatMap((group) => group.candidates)
    .find((item) => item.key === adapterKey)
  const clientUrl = candidate?.client.url
  const styleUrl = candidate?.style?.url

  useEffect(() => {
    stateRef.current = view.state
    mountedRef.current?.update?.(view.state)
  }, [view.revision, view.state])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const controller = new AbortController()
    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    const container = document.createElement("div")
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
      notice.textContent = "Native adapter unavailable. Opening Pi TUI…"
      notice.style.cssText =
        "margin:0;padding:12px;font:14px system-ui;opacity:.7"
      shadowRoot.replaceChildren(notice)
      void report(identity, "error", message).catch(console.error)
    }

    void (async () => {
      if (!clientUrl) {
        throw new Error(`Missing client asset for ${adapterKey}.`)
      }
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
        invoke: (action, input) => invoke(identity, action, input),
        close: (result) => {
          void invoke(identity, "__close", result)
            .catch((error: unknown) =>
              report(
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
      await report(identity, "ready")
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
      if (mounted) {
        void report(identity, "disposed").catch(console.error)
      }
      shadowRoot.replaceChildren()
    }
  }, [adapterKey, clientUrl, identity, invoke, report, styleUrl, viewId])

  return <div ref={hostRef} className="min-w-0" />
}
