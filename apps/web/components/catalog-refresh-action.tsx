"use client"

import { useRef, useState } from "react"
import { RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { useModelCatalogStore } from "@/components/model-catalog-provider"
import { useI18n } from "@/components/i18n-provider"
import { refreshModelAndExtensionCatalogs } from "@/lib/catalog-refresh-client"
import type { ModelCatalogTarget } from "@/lib/model-catalog-store"

export function CatalogRefreshAction({
  modelTarget,
  projectId,
  sessionId,
  mutationToken,
}: {
  modelTarget: ModelCatalogTarget
  projectId: string | null
  sessionId?: string
  mutationToken: string
}) {
  const { t } = useI18n()
  const store = useModelCatalogStore()
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  async function refresh() {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try {
      const result = await refreshModelAndExtensionCatalogs(
        store,
        {
          models: modelTarget,
          extensionProjectId: projectId,
          sessionId,
        },
        mutationToken
      )
      const errors = [
        ...result.modelRefreshErrors,
        ...result.extensionRefreshErrors,
      ]
      if (errors.length) toast.error(errors.join("; "))
      else toast.success(t("workspace.catalog.refreshSuccess"))
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={t("workspace.catalog.refreshModelsAndExtensions")}
      aria-busy={refreshing}
      disabled={refreshing}
      onClick={() => void refresh()}
    >
      <RefreshCwIcon
        data-icon="inline-start"
        className={refreshing ? "animate-spin" : undefined}
      />
      <span className="hidden sm:inline">
        {t("workspace.catalog.refreshModelsAndExtensions")}
      </span>
    </Button>
  )
}
