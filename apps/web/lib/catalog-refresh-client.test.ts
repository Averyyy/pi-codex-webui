import assert from "node:assert/strict"
import test from "node:test"

import { refreshModelAndExtensionCatalogs } from "@/lib/catalog-refresh-client"
import type {
  ModelCatalogSnapshot,
  ModelCatalogStore,
} from "@/lib/model-catalog-store"
import {
  dispatchWebUiExtensionCatalogInvalidated,
  WEBUI_EXTENSION_CATALOG_INVALIDATED,
  WEBUI_EXTENSION_CATALOG_UPDATED,
  webUiExtensionCatalogSecurityEpoch,
} from "@/lib/webui-extension-events"
import type { WebUiExtensionCatalogView } from "@/lib/webui-extensions/types"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function catalog(projectId: string): WebUiExtensionCatalogView {
  return {
    catalogIdentity: `identity-${projectId}`,
    catalogVersion: `version-${projectId}`,
    revision: 1,
    projectId,
    projectTrusted: true,
    groups: [],
    diagnostics: [],
    statuses: [],
  }
}

function modelSnapshot(): ModelCatalogSnapshot {
  return {
    catalogIdentity: "model-identity",
    catalogVersion: "model-version",
    models: [],
    providers: [],
    enabledModels: null,
    defaultModel: null,
  }
}

function installWindow() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  const target = new EventTarget()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: target,
  })
  return {
    target,
    restore() {
      if (previous) Object.defineProperty(globalThis, "window", previous)
      else Reflect.deleteProperty(globalThis, "window")
    },
  }
}

function modelStore() {
  return {
    refresh: async () => modelSnapshot(),
  } as unknown as ModelCatalogStore
}

test("a security invalidation fences a delayed trusted extension refresh result", async () => {
  const windowState = installWindow()
  const pending = deferred<Response>()
  const originalFetch = globalThis.fetch
  const events: string[] = []
  const projectId = "catalog-refresh-security-race"
  windowState.target.addEventListener(WEBUI_EXTENSION_CATALOG_UPDATED, () => {
    events.push("updated")
  })
  globalThis.fetch = (() => pending.promise) as typeof fetch
  try {
    const refresh = refreshModelAndExtensionCatalogs(
      modelStore(),
      {
        models: { projectId },
        extensionProjectId: projectId,
        sessionId: "session-a",
      },
      "mutation-token"
    )
    dispatchWebUiExtensionCatalogInvalidated({
      projectId,
      kind: "invalidate",
    })
    pending.resolve(Response.json(catalog(projectId)))

    const result = await refresh
    assert.equal(result.extensionCatalog, null)
    assert.match(
      result.extensionRefreshErrors[0] ?? "",
      /changed during refresh/
    )
    assert.deepEqual(events, [])
  } finally {
    globalThis.fetch = originalFetch
    windowState.restore()
  }
})

test("a matching data refresh keeps its epoch and publishes the initiating response", async () => {
  const windowState = installWindow()
  const originalFetch = globalThis.fetch
  const events: string[] = []
  const projectId = "catalog-refresh-data-project"
  const beforeEpoch = webUiExtensionCatalogSecurityEpoch(projectId)
  windowState.target.addEventListener(
    WEBUI_EXTENSION_CATALOG_INVALIDATED,
    (event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail
      events.push(`invalidated:${detail.kind}`)
    }
  )
  windowState.target.addEventListener(WEBUI_EXTENSION_CATALOG_UPDATED, () => {
    events.push("updated")
  })
  globalThis.fetch = (async () =>
    Response.json(catalog(projectId))) as typeof fetch
  try {
    const result = await refreshModelAndExtensionCatalogs(
      modelStore(),
      {
        models: { projectId },
        extensionProjectId: projectId,
        sessionId: "session-b",
      },
      "mutation-token"
    )

    assert.equal(
      result.extensionCatalog?.catalogIdentity,
      `identity-${projectId}`
    )
    assert.deepEqual(events, ["invalidated:data-refresh", "updated"])
    assert.equal(webUiExtensionCatalogSecurityEpoch(projectId), beforeEpoch)
  } finally {
    globalThis.fetch = originalFetch
    windowState.restore()
  }
})
