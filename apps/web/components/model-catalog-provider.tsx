"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import {
  createModelCatalogStore,
  type ModelCatalogTarget,
  type ModelCatalogStore,
} from "@/lib/model-catalog-store"
import {
  MODEL_CATALOG_INVALIDATED,
  type ModelCatalogInvalidatedDetail,
} from "@/lib/model-catalog-events"
import { SessionExtensionStoreProvider } from "@/components/session-extension-store-provider"

const ModelCatalogContext = createContext<ModelCatalogStore | null>(null)

export function ModelCatalogProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createModelCatalogStore)
  useEffect(() => {
    const revalidate = (
      target: ModelCatalogTarget,
      scope: "all" | "enabled"
    ) => {
      if (store.invalidate(target, scope)) {
        void store.load(target, scope).catch(() => undefined)
      }
    }
    const onInvalidated = (event: Event) => {
      const detail = (event as CustomEvent<ModelCatalogInvalidatedDetail>)
        .detail
      if (detail?.all === true) {
        for (const target of store.invalidateAll()) {
          void store.load(target.target, target.scope).catch(() => undefined)
        }
        return
      }
      if (detail?.catalogIdentity) {
        if (
          detail.kind === "data-refresh" &&
          typeof detail.catalogVersion === "string"
        ) {
          for (const target of store.revalidateIdentity(
            detail.catalogIdentity,
            detail.catalogVersion
          )) {
            void store
              .load(target.target, target.scope, { force: true })
              .then((snapshot) => {
                const state = store.getState(target.target, target.scope)
                if (
                  snapshot.catalogIdentity === detail.catalogIdentity &&
                  state.catalogIdentity === detail.catalogIdentity &&
                  snapshot.catalogVersion !== detail.catalogVersion
                ) {
                  return store.load(target.target, target.scope, {
                    force: true,
                  })
                }
                return snapshot
              })
              .catch(() => undefined)
          }
          return
        }
        for (const target of store.invalidateIdentity(
          detail.catalogIdentity,
          detail.catalogVersion
        )) {
          void store.load(target.target, target.scope).catch(() => undefined)
        }
        return
      }
      if (!detail?.target) return
      revalidate(detail.target, "all")
      revalidate(detail.target, "enabled")
    }
    window.addEventListener(MODEL_CATALOG_INVALIDATED, onInvalidated)
    return () =>
      window.removeEventListener(MODEL_CATALOG_INVALIDATED, onInvalidated)
  }, [store])
  return (
    <ModelCatalogContext.Provider value={store}>
      <SessionExtensionStoreProvider>{children}</SessionExtensionStoreProvider>
    </ModelCatalogContext.Provider>
  )
}

export function useModelCatalogStore() {
  const store = useContext(ModelCatalogContext)
  if (!store) {
    throw new Error("Model catalog consumers require ModelCatalogProvider.")
  }
  return store
}
