"use client"

import { useCallback, useEffect, useRef, useState } from "react"

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
  const [catalog, setCatalogState] = useState(initialCatalog)
  const updateSequence = useRef(0)
  const sessionKey = sessionIds.join("\0")
  const setCatalog = useCallback((next: ResourceCatalog) => {
    updateSequence.current += 1
    setCatalogState(next)
  }, [])

  useEffect(() => {
    if (!sessionKey) return
    const search = new URLSearchParams()
    for (const sessionId of sessionKey.split("\0")) {
      search.append("sessionId", sessionId)
    }
    const events = new EventSource(`/api/v1/events?${search}`)
    const refresh = async () => {
      const sequence = ++updateSequence.current
      try {
        const response = await fetch(
          `/api/v1/resources?projectId=${encodeURIComponent(projectId)}`
        )
        const body = await response.json()
        if (!response.ok) {
          if (sequence !== updateSequence.current) return
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
        const next = resourceCatalogSchema.parse(body)
        if (sequence !== updateSequence.current) return
        setCatalogState(next)
        onError(null)
      } catch (error) {
        if (sequence !== updateSequence.current) return
        onError(
          error instanceof Error ? error.message : "读取 Pi 资源状态失败。"
        )
      }
    }
    const handle = () => void refresh()
    events.addEventListener("runtime.ready", handle)
    events.addEventListener("resync.required", handle)
    return () => {
      updateSequence.current += 1
      events.close()
    }
  }, [onError, projectId, sessionKey])

  return [catalog, setCatalog] as const
}
