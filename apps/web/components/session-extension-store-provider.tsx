"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import {
  createSessionExtensionStore,
  type SessionExtensionStore,
} from "@/lib/session-extension-store"
import {
  WEBUI_EXTENSION_CATALOG_INVALIDATED,
  type WebUiExtensionCatalogInvalidatedDetail,
} from "@/lib/webui-extension-events"

const SessionExtensionStoreContext =
  createContext<SessionExtensionStore | null>(null)

export function SessionExtensionStoreProvider({
  children,
}: {
  children: ReactNode
}) {
  const [store] = useState(createSessionExtensionStore)
  useEffect(() => {
    const onInvalidated = (event: Event) => {
      const detail = (
        event as CustomEvent<WebUiExtensionCatalogInvalidatedDetail>
      ).detail
      if (
        !detail ||
        (typeof detail.projectId !== "string" && detail.projectId !== null)
      ) {
        return
      }
      store.invalidateCatalogs(
        detail.projectId,
        detail.catalogIdentity,
        detail.catalogVersion,
        detail.kind ?? "invalidate"
      )
    }
    window.addEventListener(WEBUI_EXTENSION_CATALOG_INVALIDATED, onInvalidated)
    return () =>
      window.removeEventListener(
        WEBUI_EXTENSION_CATALOG_INVALIDATED,
        onInvalidated
      )
  }, [store])
  return (
    <SessionExtensionStoreContext.Provider value={store}>
      {children}
    </SessionExtensionStoreContext.Provider>
  )
}

export function useSessionExtensionStore() {
  const store = useContext(SessionExtensionStoreContext)
  if (!store) {
    throw new Error(
      "Session extension consumers require SessionExtensionStoreProvider."
    )
  }
  return store
}
