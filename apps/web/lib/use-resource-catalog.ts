"use client"

import { useEffect, useState } from "react"

import {
  resourceCatalogSchema,
  type ResourceCatalog,
} from "@workspace/runtime-protocol"

export function useResourceCatalog(
  projectId: string,
  sessionIds: string[],
  initialCatalog: ResourceCatalog,
  onError: (error: string | null) => void
) {
  const [catalog, setCatalog] = useState(initialCatalog)
  const sessionKey = sessionIds.join("\0")

  useEffect(() => {
    if (!sessionKey) return
    const search = new URLSearchParams()
    for (const sessionId of sessionKey.split("\0")) {
      search.append("sessionId", sessionId)
    }
    const events = new EventSource(`/api/v1/events?${search}`)
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/v1/resources?projectId=${encodeURIComponent(projectId)}`
        )
        const body = await response.json()
        if (!response.ok) {
          onError(
            typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof body.error === "string"
              ? body.error
              : "读取 Pi 资源状态失败。"
          )
          return
        }
        setCatalog(resourceCatalogSchema.parse(body))
        onError(null)
      } catch (error) {
        onError(
          error instanceof Error ? error.message : "读取 Pi 资源状态失败。"
        )
      }
    }
    const handle = () => void refresh()
    events.addEventListener("runtime.ready", handle)
    events.addEventListener("resync.required", handle)
    return () => events.close()
  }, [onError, projectId, sessionKey])

  return [catalog, setCatalog] as const
}
