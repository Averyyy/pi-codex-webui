"use client"

import type { WebUiPlacement } from "@workspace/runtime-protocol"

import { WebUiViewHost } from "@/components/webui-view-host"
import {
  useSessionExtensionState,
  useSessionExtensionViewIds,
} from "@/components/session-extension-provider"

export function ExtensionSlot({
  name,
  excludeViewIds = [],
}: {
  name: WebUiPlacement
  excludeViewIds?: string[]
}) {
  const state = useSessionExtensionState()
  const instanceIds = useSessionExtensionViewIds(name, excludeViewIds)
  return (
    <>
      {instanceIds.map((instanceId) => (
        <WebUiViewHost key={instanceId} instanceId={instanceId} />
      ))}
      {name === "session.header" && (state.viewsError || state.catalogError) ? (
        <span className="px-2 text-xs text-destructive" role="status">
          {state.viewsError ?? state.catalogError}
        </span>
      ) : null}
    </>
  )
}
