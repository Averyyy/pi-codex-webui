"use client"

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"

import { useModelCatalogStore } from "@/components/model-catalog-provider"
import {
  EMPTY_MODEL_CATALOG_STATE,
  type ModelCatalogScope,
  type ModelCatalogTarget,
} from "@/lib/model-catalog-store"

export function useModelCatalog(
  target: ModelCatalogTarget,
  scope: ModelCatalogScope
) {
  const store = useModelCatalogStore()
  const sessionId = target.sessionId
  const projectId = target.projectId
  const newTask = target.newTask
  const defaultTarget = target.defaultTarget
  const stableTarget = useMemo<ModelCatalogTarget>(
    () => ({ sessionId, projectId, newTask, defaultTarget }),
    [sessionId, projectId, newTask, defaultTarget]
  )
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(stableTarget, scope, listener),
    [scope, stableTarget, store]
  )
  const getSnapshot = useCallback(
    () => store.getState(stableTarget, scope),
    [scope, stableTarget, store]
  )
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_MODEL_CATALOG_STATE
  )

  useEffect(() => {
    void store.load(stableTarget, scope).catch(() => undefined)
  }, [scope, stableTarget, store])

  const retry = useCallback(
    () => store.load(stableTarget, scope, { force: true }),
    [scope, stableTarget, store]
  )

  return { ...state, retry }
}
